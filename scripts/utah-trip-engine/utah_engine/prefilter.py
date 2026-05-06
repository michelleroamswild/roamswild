"""Cheap heuristic gate before the LLM sees a snippet.

Sets `snippets.skipped_reason` to a non-null tag when a row clearly isn't
worth enriching. Enrichment only consumes rows where ``skipped_reason IS
NULL AND enriched_at IS NULL``.

Reasons:
  - too_short: < 50 chars (a one-liner with no detail)
  - too_long:  > 4000 chars (likely a megathread / scraped homepage; we'd
                burn LLM tokens classifying noise)
  - no_outdoor_keyword: doesn't mention any outdoor-recreation term
  - no_place_name: doesn't reference a UGRC trail name, region name, or
                   gazetteer landmark (this should be rare since the Reddit
                   scraper pre-filters, but other scrapers may not)
"""
from __future__ import annotations

import re
from typing import Iterable

from sqlalchemy import or_, select, update

from utah_engine.db import session_scope
from utah_engine.models import PilotRegion, Snippet, UtahPOI

MIN_LEN = 50
MAX_LEN = 4000

# Outdoor-recreation vocabulary. Lowercased; matched case-insensitively.
_OUTDOOR_TOKENS: frozenset[str] = frozenset(
    {
        # Trails
        "trail", "trails", "trailhead", "hike", "hikes", "hiking", "hiked",
        # Driving
        "road", "roads", "drive", "driving", "drove", "jeep", "4wd", "4x4",
        "rig", "overland", "overlanding", "wheel", "wheeling", "wheeler",
        # Vistas
        "view", "viewpoint", "overlook", "scenic", "vista", "panorama",
        # Photography / time-based
        "photo", "photos", "photography", "photographer", "stargazing",
        "sunrise", "sunset", "milky way", "golden hour", "blue hour",
        # Camping
        "camp", "camped", "camping", "campsite", "campground", "campgrounds",
        "dispersed", "boondock", "boondocking", "tent", "rv",
        # Climbing / canyoneering
        "climb", "climbing", "scramble", "scrambling", "rappel", "canyoneer",
        # Geological features
        "slot", "canyon", "canyons", "mesa", "butte", "arch", "arches",
        "falls", "spring", "springs", "river", "creek", "lake", "pool",
        "slickrock", "sand", "dunes", "rock", "boulder", "tower", "fin",
        "petroglyph", "petroglyphs", "pictograph", "ruins",
        # Topography
        "mountain", "mountains", "peak", "summit", "ridge", "pass", "valley",
        "plateau", "rim", "wash",
        # Activities
        "biking", "mtb", "atv", "utv", "ohv", "horseback", "fishing",
        "kayak", "kayaking", "paddle", "paddling", "raft", "rafting",
        "ski", "skiing", "snowshoe", "swim", "swimming", "wildlife",
        # Trip planning vocabulary
        "explore", "exploration", "adventure", "expedition", "weekend trip",
        "day trip", "itinerary", "route", "routes",
    }
)

_OUTDOOR_RE = re.compile(
    r"\b(" + "|".join(re.escape(t) for t in sorted(_OUTDOOR_TOKENS, key=len, reverse=True)) + r")\b",
    re.IGNORECASE,
)


def _load_place_pattern() -> re.Pattern[str]:
    """Compile a regex of every place name worth mentioning: UGRC trail
    names + region names. Hand gazetteer is added so blog/forum content
    that doesn't reference a UGRC entry can still pass.
    """
    terms: set[str] = set()
    with session_scope() as s:
        for (name,) in s.execute(select(UtahPOI.name)).all():
            if isinstance(name, str) and len(name.strip()) >= 5:
                terms.add(name.strip().lower())
        for (name,) in s.execute(select(PilotRegion.name)).all():
            if isinstance(name, str) and len(name.strip()) >= 3:
                terms.add(name.strip().lower())

    # Always include the hand-curated landmarks (mirrors the Reddit scraper).
    from utah_engine.scrapers.reddit import _HAND_GAZETTEER

    terms.update(_HAND_GAZETTEER)

    if not terms:
        # Defensive: an empty pattern would match nothing; keep the prefilter
        # idempotent on a fresh DB by matching just "moab".
        terms = {"moab"}
    return re.compile(
        r"\b(" + "|".join(re.escape(t) for t in sorted(terms, key=len, reverse=True)) + r")\b",
        re.IGNORECASE,
    )


def _classify(text: str, place_re: re.Pattern[str]) -> str | None:
    n = len(text)
    if n < MIN_LEN:
        return "too_short"
    if n > MAX_LEN:
        return "too_long"
    if not _OUTDOOR_RE.search(text):
        return "no_outdoor_keyword"
    if not place_re.search(text):
        return "no_place_name"
    return None


def run_prefilter() -> dict[str, int]:
    """Set `skipped_reason` on snippets that fail the gate.

    Returns a histogram of {reason: count}, including ``passed``.
    """
    place_re = _load_place_pattern()
    counts: dict[str, int] = {"passed": 0}

    with session_scope() as s:
        # Only operate on rows that haven't been classified yet AND haven't
        # already been enriched (rerunning shouldn't reclassify processed rows).
        rows = s.execute(
            select(Snippet.id, Snippet.raw_text).where(
                Snippet.skipped_reason.is_(None),
                Snippet.enriched_at.is_(None),
            )
        ).all()

        for row_id, text in rows:
            reason = _classify(text or "", place_re)
            if reason:
                s.execute(
                    update(Snippet)
                    .where(Snippet.id == row_id)
                    .values(skipped_reason=reason)
                )
                counts[reason] = counts.get(reason, 0) + 1
            else:
                counts["passed"] += 1

    return counts


def reset_prefilter(reasons: Iterable[str] | None = None) -> int:
    """Clear `skipped_reason` for chosen reasons (or all). Useful when
    tweaking the keyword list and re-running.
    """
    with session_scope() as s:
        stmt = update(Snippet).values(skipped_reason=None)
        if reasons:
            stmt = stmt.where(or_(*[Snippet.skipped_reason == r for r in reasons]))
        else:
            stmt = stmt.where(Snippet.skipped_reason.isnot(None))
        result = s.execute(stmt)
        return result.rowcount or 0
