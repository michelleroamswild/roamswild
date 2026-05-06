"""Anthropic Claude tool-use enrichment with disk cache + budget guard.

For every snippet that passed the prefilter:
  1. Hash its text. If we've enriched the same content before, reuse the
     cached extraction (no API call).
  2. Otherwise call Claude (Haiku 4.5 by default) with a forced tool-use,
     prompt caching on the system prompt and tool schema.
  3. Validate the tool result with Pydantic. Bad output is logged + skipped
     — no retries (mirrors the project's "Supabase failures stop loud" rule).
  4. Stamp the snippet's `enrichment` JSONB and `enriched_at` timestamp.
  5. Track running spend; halt the batch if it would exceed BUDGET_CAP.
"""
from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from utah_engine.budget import Budget, BudgetExceeded, TokenUsage, estimate_pass_cost
from utah_engine.config import settings
from utah_engine.db import session_scope
from utah_engine.models import EnrichedPOI, Snippet

CACHE_DIR = Path(__file__).parent.parent / ".cache" / "llm"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

SYSTEM_PROMPT = (
    "You extract structured Utah outdoor-recreation metadata from messy "
    "user-generated text (Reddit posts, blog snippets, forum threads). "
    "Each call you receive ONE snippet about somewhere near Moab, Utah.\n\n"
    "Rules:\n"
    "- Always return via the extract_poi_metadata tool — never plain text.\n"
    "- Only fill fields you can defensibly infer from the snippet itself. "
    "Leave unknowns null or empty; never invent ratings, danger tags, or "
    "vehicle requirements.\n"
    "- poi_type: choose the single best fit. If the snippet is broadly "
    "about a town or region rather than a specific place, use 'other_landmark'.\n"
    "- difficulty_rating: prefer the author's vocabulary ('Stock', 'Modified', "
    "'Extreme', or a 1-5 number). Don't invent a scale.\n"
    "- scenic_score: 1-10. Anchor on the adjective intensity — 'pretty' ~6, "
    "'breathtaking' ~9, 'jaw-dropping otherworldly' ~10. Null if no aesthetic "
    "language is used.\n"
    "- vehicle_requirements / danger_tags: extract literal claims only. If the "
    "author says 'we did this in a stock 4Runner', that's 'AWD OK' or 'High "
    "Clearance', not '4WD Required'.\n"
    "- mentioned_places: list every distinct trail/road/landmark/town name. "
    "Used to match this snippet to authoritative records.\n"
    "- summary: one sentence (~25 words), neutral prose, no marketing tone.\n"
)

TOOL_DESCRIPTION = (
    "Return the extracted metadata for the snippet. Always call this exactly once."
)


@dataclass
class EnrichResult:
    snippet_id: str
    enrichment: dict[str, Any]
    cost_usd: float
    cache_hit: bool


def _content_hash(text: str) -> str:
    return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()[:16]


def _cache_path(content_hash: str) -> Path:
    return CACHE_DIR / f"{content_hash}.json"


def _load_cache(content_hash: str) -> dict[str, Any] | None:
    p = _cache_path(content_hash)
    if p.exists():
        try:
            return json.loads(p.read_text())
        except Exception:
            return None
    return None


def _save_cache(content_hash: str, payload: dict[str, Any]) -> None:
    _cache_path(content_hash).write_text(json.dumps(payload, indent=2))


def _build_tool_schema() -> dict[str, Any]:
    """Pydantic-derived JSON Schema for the Anthropic tool input."""
    schema = EnrichedPOI.model_json_schema()
    # Anthropic's tool-use API expects `additionalProperties: false` on the
    # top-level object schema for stricter parsing.
    schema.setdefault("additionalProperties", False)
    return schema


def _enrich_one(
    client: Any,
    text: str,
    *,
    budget: Budget,
    model: str,
) -> tuple[EnrichedPOI, TokenUsage, float, bool]:
    """Returns (validated, usage, cost_usd, cache_hit)."""

    chash = _content_hash(text)
    cached = _load_cache(chash)
    if cached is not None:
        budget.note_cache_hit()
        return EnrichedPOI.model_validate(cached["enrichment"]), TokenUsage(0, 0), 0.0, True

    response = client.messages.create(
        model=model,
        max_tokens=1024,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        tools=[
            {
                "name": "extract_poi_metadata",
                "description": TOOL_DESCRIPTION,
                "input_schema": _build_tool_schema(),
                "cache_control": {"type": "ephemeral"},
            }
        ],
        tool_choice={"type": "tool", "name": "extract_poi_metadata"},
        messages=[{"role": "user", "content": text}],
    )

    # Pull the tool-use block.
    extracted: dict[str, Any] | None = None
    for block in response.content:
        if getattr(block, "type", None) == "tool_use" and getattr(block, "name", "") == "extract_poi_metadata":
            extracted = dict(block.input)
            break
    if extracted is None:
        raise RuntimeError("Claude did not return the expected tool call.")

    validated = EnrichedPOI.model_validate(extracted)

    usage_obj = response.usage
    usage = TokenUsage(
        input_tokens=getattr(usage_obj, "input_tokens", 0) or 0,
        output_tokens=getattr(usage_obj, "output_tokens", 0) or 0,
        cache_write_tokens=getattr(usage_obj, "cache_creation_input_tokens", 0) or 0,
        cache_read_tokens=getattr(usage_obj, "cache_read_input_tokens", 0) or 0,
    )
    cost = budget.record(model, usage)
    _save_cache(
        chash,
        {
            "model": model,
            "enrichment": validated.model_dump(),
            "usage": usage.__dict__,
        },
    )
    return validated, usage, cost, False


def enrich_pending(
    *,
    batch: int = 50,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Run enrichment over snippets that passed prefilter and aren't yet enriched.

    Returns a summary dict with counts + spend.
    """
    with session_scope() as s:
        rows: list[tuple[str, str]] = [
            (str(r[0]), r[1])
            for r in s.execute(
                select(Snippet.id, Snippet.raw_text).where(
                    Snippet.skipped_reason.is_(None),
                    Snippet.enriched_at.is_(None),
                )
            ).all()
        ]

    avg_chars = (sum(len(t) for _, t in rows) // max(len(rows), 1)) if rows else 0
    estimated = estimate_pass_cost(settings.anthropic_model, len(rows), avg_chars)
    if dry_run:
        return {
            "dry_run": True,
            "candidates": len(rows),
            "avg_chars": avg_chars,
            "estimated_cost_usd": round(estimated, 4),
            "budget_cap_usd": settings.budget_cap,
        }

    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set; aborting.")

    # Lazy-import the SDK so a missing key doesn't break unrelated CLI commands.
    import anthropic

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    budget = Budget(cap_usd=settings.budget_cap)

    processed = 0
    cache_hits = 0
    failures = 0
    started = time.monotonic()

    for snippet_id, text in rows[:batch]:
        try:
            enriched, _usage, _cost, cache_hit = _enrich_one(
                client, text, budget=budget, model=settings.anthropic_model
            )
        except BudgetExceeded as exc:
            return _summary(
                budget,
                processed=processed,
                cache_hits=cache_hits,
                failures=failures,
                halted=str(exc),
                started=started,
                total=len(rows),
            )
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(f"[enrich] failure on snippet {snippet_id}: {exc}")
            continue

        if cache_hit:
            cache_hits += 1
        processed += 1

        with session_scope() as s:
            _persist_enrichment(s, snippet_id, enriched)

    return _summary(
        budget,
        processed=processed,
        cache_hits=cache_hits,
        failures=failures,
        halted=None,
        started=started,
        total=len(rows),
    )


def _persist_enrichment(s: Session, snippet_id: str, enriched: EnrichedPOI) -> None:
    s.execute(
        update(Snippet)
        .where(Snippet.id == snippet_id)
        .values(
            enrichment=enriched.model_dump(),
            enriched_at=datetime.now(timezone.utc),
        )
    )


def _summary(
    budget: Budget,
    *,
    processed: int,
    cache_hits: int,
    failures: int,
    halted: str | None,
    started: float,
    total: int,
) -> dict[str, Any]:
    return {
        "candidates": total,
        "processed": processed,
        "cache_hits": cache_hits,
        "failures": failures,
        "remaining": max(0, total - processed),
        "spent_usd": round(budget.spent_usd, 4),
        "calls": budget.calls,
        "halted_reason": halted,
        "elapsed_s": round(time.monotonic() - started, 1),
    }
