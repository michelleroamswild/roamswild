"""Tier 1 + Tier 3a enrichment passes over `master_places`.

Each function reads master rows, derives one or more attributes, and
writes them under ``metadata_tags.<key>`` so the recommendation engine
has a single bag of derived signal alongside the raw merged tags.

Stages (each idempotent — re-running overwrites):
  1. ``link_reddit_signals``    — fuzzy-attach pre-enriched Reddit snippet tags
  2. ``derive_activity_tags``   — pattern-match name + poi_type
  3. ``compute_crowdedness``    — heuristic from photo_count + sources + ls
  4. ``resolve_thumbnails``     — Wikimedia file titles → thumbnail URLs
  5. ``compute_sun_ephemeris``  — sunrise/sunset/golden/blue per season
  6. ``compute_nearby``         — k-nearest other master places
  7. ``enrich_with_vision``     — Claude Haiku 4.5 vision (Tier 3a, paid)
"""
from __future__ import annotations

import base64
import json
import math
import re
import time
from dataclasses import dataclass
from datetime import date
from typing import Any

import requests
from rapidfuzz import fuzz
from sqlalchemy import text

from utah_engine.budget import Budget, BudgetExceeded, TokenUsage
from utah_engine.config import settings
from utah_engine.db import session_scope


# ============================================================================
# 1. Reddit-snippet cross-link
# ============================================================================

def link_reddit_signals(name_threshold: int = 80) -> dict[str, int]:
    """For each master place, find Reddit snippets whose `mentioned_places`
    contain a fuzzy match for the canonical_name, then attach the snippet's
    LLM enrichment under metadata_tags.reddit_signals.
    """
    with session_scope() as s:
        snippets = s.execute(
            text(
                """
                SELECT id::text, source, source_url, name AS snippet_name,
                       enrichment, raw_text
                FROM snippets
                WHERE source LIKE 'reddit%'
                  AND enriched_at IS NOT NULL
                  AND skipped_reason IS NULL
                """
            )
        ).mappings().all()
        master = s.execute(
            text("SELECT id::text, canonical_name FROM master_places")
        ).mappings().all()

        attached = 0
        # Build per-master accumulator
        accum: dict[str, list[dict[str, Any]]] = {}

        for snip in snippets:
            mentioned = (snip["enrichment"] or {}).get("mentioned_places") or []
            if not mentioned:
                continue
            for m in master:
                cname = m["canonical_name"] or ""
                if not cname:
                    continue
                # Best score across this snippet's mentioned_places
                best = max(
                    (int(fuzz.token_set_ratio(cname, mention)) for mention in mentioned),
                    default=0,
                )
                if best < name_threshold:
                    continue
                accum.setdefault(m["id"], []).append(
                    {
                        "snippet_id": snip["id"],
                        "snippet_source": snip["source"],
                        "snippet_url": snip["source_url"],
                        "match_score": best,
                        "summary": (snip["enrichment"] or {}).get("summary"),
                        "scenic_score": (snip["enrichment"] or {}).get("scenic_score"),
                        "best_time": (snip["enrichment"] or {}).get("best_time"),
                        "vehicle_requirements": (snip["enrichment"] or {}).get(
                            "vehicle_requirements"
                        ),
                        "danger_tags": (snip["enrichment"] or {}).get("danger_tags"),
                        "difficulty_rating": (snip["enrichment"] or {}).get(
                            "difficulty_rating"
                        ),
                    }
                )

        for master_id, signals in accum.items():
            s.execute(
                text(
                    """
                    UPDATE master_places
                    SET metadata_tags = metadata_tags
                      || jsonb_build_object('reddit_signals', CAST(:s AS jsonb))
                    WHERE id = CAST(:id AS uuid)
                    """
                ),
                {"id": master_id, "s": json.dumps(signals, default=str)},
            )
            attached += 1

    return {"snippets_considered": len(snippets), "master_rows_linked": attached}


# ============================================================================
# 2. Activity tags from name + poi_type
# ============================================================================

# (poi_type → activity tags). Also keyword-based name patterns layered on top.
_TYPE_ACTIVITIES: dict[str, list[str]] = {
    "arch": ["photography", "sunrise", "easy_walk", "iconic"],
    "summit": ["hiking", "view", "scrambling", "advanced"],
    "scenic_overlook": ["photography", "easy_access", "sunset"],
    "trail": ["hiking"],
    "trailhead": ["hiking"],
    "cliff": ["photography", "view", "exposure_warning"],
    "pillar": ["photography", "climbing", "iconic"],
    "spring": ["water_source", "wildlife", "shaded"],
    "hot_spring": ["soaking", "wildlife", "winter_friendly"],
    "waterfall": ["photography", "water", "easy_hike"],
    "slot_canyon": ["hiking", "narrow", "flash_flood_risk", "shaded"],
    "petroglyph_site": ["history", "archaeology", "photography", "easy_access"],
    "dark_sky_spot": ["stargazing", "night_photography", "remote"],
    "swimming_hole": ["swimming", "water", "summer_friendly"],
    "dinosaur_track": ["history", "family_friendly", "easy_access"],
    "hidden_gem": ["off_the_radar", "uncrowded"],
    "valley": ["scenery"],
    "basin": ["scenery"],
    "ridge": ["hiking", "view"],
    "pass": ["scenic_drive", "view"],
    "lake": ["water", "fishing", "photography"],
    "rapids": ["water", "rafting"],
    "reservoir": ["water", "boating"],
    "mountain_range": ["scenery", "drive_through"],
    "ghost_town": ["history", "photography", "exploration"],
    "historic_settlement": ["history", "photography", "exploration"],
    "campsite": ["camping"],
    "picnic_site": ["picnic", "family_friendly"],
    "visitor_center": ["info", "amenities"],
}

_NAME_PATTERNS: list[tuple[re.Pattern[str], list[str]]] = [
    (re.compile(r"\b(arch|natural bridge)\b", re.I), ["arch", "iconic"]),
    (re.compile(r"\b(falls|waterfall)\b", re.I), ["waterfall", "water"]),
    (re.compile(r"\bspring\b", re.I), ["water_source"]),
    (re.compile(r"\bcanyon\b", re.I), ["canyon", "shaded"]),
    (re.compile(r"\b(narrows|slot)\b", re.I), ["slot_canyon", "narrow", "flash_flood_risk"]),
    (re.compile(r"\b(peak|mountain|summit)\b", re.I), ["summit", "view"]),
    (re.compile(r"\b(overlook|viewpoint|vista)\b", re.I), ["scenic_overlook", "easy_access"]),
    (re.compile(r"\b(petroglyph|pictograph|rock art)\b", re.I), ["archaeology", "history"]),
    (re.compile(r"\b(ruin|historic)\b", re.I), ["history"]),
    (re.compile(r"\bhot spring\b", re.I), ["hot_spring", "soaking"]),
    (re.compile(r"\b(road|drive)\b", re.I), ["scenic_drive"]),
    (re.compile(r"\b(reservoir|lake)\b", re.I), ["water"]),
]


def _activity_tags_for(name: str, poi_type: str) -> list[str]:
    tags = set(_TYPE_ACTIVITIES.get(poi_type, []))
    for pattern, extra in _NAME_PATTERNS:
        if pattern.search(name or ""):
            tags.update(extra)
    return sorted(tags)


def derive_activity_tags() -> dict[str, int]:
    updated = 0
    with session_scope() as s:
        rows = s.execute(
            text("SELECT id::text, canonical_name, poi_type FROM master_places")
        ).mappings().all()
        for r in rows:
            tags = _activity_tags_for(r["canonical_name"] or "", r["poi_type"] or "")
            s.execute(
                text(
                    """
                    UPDATE master_places
                    SET metadata_tags = metadata_tags
                      || jsonb_build_object('activity_tags', CAST(:t AS jsonb))
                    WHERE id = CAST(:id AS uuid)
                    """
                ),
                {"id": r["id"], "t": json.dumps(tags)},
            )
            updated += 1
    return {"updated": updated}


# ============================================================================
# 3. Crowdedness heuristic
# ============================================================================

def _crowd_score(photo_count: int, source_count: int, ls: bool, gem: bool) -> str:
    # High: 20+ photos OR 4+ sources
    # Moderate: 5-19 photos OR 3 sources OR locationscout endorsement
    # Low: everything else
    # Hidden gem flag overrides toward "low" if low signal
    if photo_count >= 20 or source_count >= 4:
        return "high"
    if photo_count >= 5 or source_count >= 3 or ls:
        return "moderate"
    return "low"


def compute_crowdedness() -> dict[str, int]:
    counts = {"low": 0, "moderate": 0, "high": 0}
    with session_scope() as s:
        rows = s.execute(
            text(
                """
                SELECT id::text, photo_count, source_count, locationscout_endorsed,
                       is_hidden_gem
                FROM master_places
                """
            )
        ).mappings().all()
        for r in rows:
            score = _crowd_score(
                r["photo_count"] or 0,
                r["source_count"] or 0,
                bool(r["locationscout_endorsed"]),
                bool(r["is_hidden_gem"]),
            )
            counts[score] += 1
            s.execute(
                text(
                    """
                    UPDATE master_places
                    SET metadata_tags = metadata_tags
                      || jsonb_build_object('crowdedness', :c)
                    WHERE id = CAST(:id AS uuid)
                    """
                ),
                {"id": r["id"], "c": score},
            )
    return counts


# ============================================================================
# 4. Wikimedia thumbnail URLs
# ============================================================================

def resolve_thumbnails(thumb_width: int = 800, throttle_s: float = 0.3) -> dict[str, int]:
    """For each master place that has wikimedia samples, batch-fetch the
    first sample's thumbnail URL via Wikimedia imageinfo.
    """
    api = "https://commons.wikimedia.org/w/api.php"
    ua = "roamswild-utah-pilot/0.1 (hello@roamswild.app)"

    resolved = 0
    failed = 0

    with session_scope() as s:
        rows = s.execute(
            text(
                """
                SELECT m.id::text AS id,
                       (m.metadata_tags->'wikimedia'->'samples'->0->>'title') AS title
                FROM master_places m
                WHERE m.metadata_tags->'wikimedia'->'samples'->0->>'title' IS NOT NULL
                """
            )
        ).mappings().all()

        # Batch up to 50 titles per API call
        BATCH = 50
        for i in range(0, len(rows), BATCH):
            batch = rows[i : i + BATCH]
            titles = "|".join(r["title"] for r in batch)
            try:
                r = requests.get(
                    api,
                    params={
                        "action": "query",
                        "titles": titles,
                        "prop": "imageinfo",
                        "iiprop": "url|extmetadata",
                        "iiurlwidth": thumb_width,
                        "format": "json",
                        "formatversion": 2,
                    },
                    headers={"User-Agent": ua},
                    timeout=30,
                )
                r.raise_for_status()
                pages = {p.get("title"): p for p in r.json().get("query", {}).get("pages", [])}
            except Exception as exc:  # noqa: BLE001
                print(f"[thumbnails] batch failed: {exc}")
                failed += len(batch)
                continue

            for row in batch:
                page = pages.get(row["title"])
                if not page or "imageinfo" not in page:
                    failed += 1
                    continue
                info = page["imageinfo"][0]
                meta = info.get("extmetadata") or {}
                payload = {
                    "title": row["title"],
                    "thumb_url": info.get("thumburl"),
                    "full_url": info.get("url"),
                    "width": info.get("thumbwidth"),
                    "height": info.get("thumbheight"),
                    "credit": (meta.get("Artist", {}) or {}).get("value"),
                    "license": (meta.get("LicenseShortName", {}) or {}).get("value"),
                }
                # Strip HTML out of credit
                if payload["credit"]:
                    payload["credit"] = re.sub(r"<[^>]+>", "", payload["credit"]).strip()
                s.execute(
                    text(
                        """
                        UPDATE master_places
                        SET metadata_tags = metadata_tags
                          || jsonb_build_object('thumbnail', CAST(:p AS jsonb))
                        WHERE id = CAST(:id AS uuid)
                        """
                    ),
                    {"id": row["id"], "p": json.dumps(payload)},
                )
                resolved += 1
            time.sleep(throttle_s)

    return {"resolved": resolved, "failed": failed, "no_wikimedia": "n/a"}


# ============================================================================
# 5. Sun ephemeris
# ============================================================================

def compute_sun_ephemeris() -> dict[str, int]:
    """For each master place, compute sunrise / sunset / golden-hour / blue-hour
    times for 4 reference dates (mid-Mar / mid-Jun / mid-Sep / mid-Dec — ~equinoxes/solstices).
    """
    from astral import LocationInfo
    from astral.sun import sun, golden_hour, blue_hour, SunDirection

    SEASONS = {
        "spring": date(2026, 3, 20),
        "summer": date(2026, 6, 21),
        "autumn": date(2026, 9, 22),
        "winter": date(2026, 12, 21),
    }

    updated = 0
    with session_scope() as s:
        rows = s.execute(
            text(
                "SELECT id::text, ST_Y(geom) AS lat, ST_X(geom) AS lng FROM master_places"
            )
        ).mappings().all()
        for r in rows:
            loc = LocationInfo("X", "USA", "America/Denver", float(r["lat"]), float(r["lng"]))
            payload: dict[str, Any] = {}
            for season, d in SEASONS.items():
                try:
                    s_data = sun(loc.observer, date=d, tzinfo=loc.timezone)
                    gh_morn = golden_hour(loc.observer, date=d, direction=SunDirection.RISING, tzinfo=loc.timezone)
                    gh_eve = golden_hour(loc.observer, date=d, direction=SunDirection.SETTING, tzinfo=loc.timezone)
                    bh_morn = blue_hour(loc.observer, date=d, direction=SunDirection.RISING, tzinfo=loc.timezone)
                    bh_eve = blue_hour(loc.observer, date=d, direction=SunDirection.SETTING, tzinfo=loc.timezone)
                    payload[season] = {
                        "sunrise": s_data["sunrise"].isoformat(),
                        "sunset": s_data["sunset"].isoformat(),
                        "golden_hour_morning": [gh_morn[0].isoformat(), gh_morn[1].isoformat()],
                        "golden_hour_evening": [gh_eve[0].isoformat(), gh_eve[1].isoformat()],
                        "blue_hour_morning": [bh_morn[0].isoformat(), bh_morn[1].isoformat()],
                        "blue_hour_evening": [bh_eve[0].isoformat(), bh_eve[1].isoformat()],
                    }
                except Exception:
                    continue
            s.execute(
                text(
                    """
                    UPDATE master_places
                    SET metadata_tags = metadata_tags
                      || jsonb_build_object('sun_ephemeris', CAST(:p AS jsonb))
                    WHERE id = CAST(:id AS uuid)
                    """
                ),
                {"id": r["id"], "p": json.dumps(payload)},
            )
            updated += 1
    return {"updated": updated}


# ============================================================================
# 6. Nearby spots
# ============================================================================

def compute_nearby(k: int = 5, max_distance_mi: float = 10.0) -> dict[str, int]:
    updated = 0
    with session_scope() as s:
        rows = s.execute(text("SELECT id::text FROM master_places")).mappings().all()
        for r in rows:
            nearby = s.execute(
                text(
                    """
                    SELECT id::text AS id,
                           canonical_name,
                           poi_type,
                           ROUND((ST_Distance(geom::geography,
                              (SELECT geom FROM master_places WHERE id = CAST(:self_id AS uuid))::geography)
                              / 1609.34)::numeric, 2) AS dist_mi
                    FROM master_places
                    WHERE id != CAST(:self_id AS uuid)
                      AND ST_DWithin(geom::geography,
                            (SELECT geom FROM master_places WHERE id = CAST(:self_id AS uuid))::geography,
                            :rad_m)
                    ORDER BY geom <-> (SELECT geom FROM master_places WHERE id = CAST(:self_id AS uuid))
                    LIMIT :k
                    """
                ),
                {"self_id": r["id"], "rad_m": max_distance_mi * 1609.34, "k": k},
            ).mappings().all()
            payload = [
                {"id": n["id"], "name": n["canonical_name"], "poi_type": n["poi_type"], "distance_mi": float(n["dist_mi"])}
                for n in nearby
            ]
            s.execute(
                text(
                    """
                    UPDATE master_places
                    SET metadata_tags = metadata_tags
                      || jsonb_build_object('nearby', CAST(:p AS jsonb))
                    WHERE id = CAST(:id AS uuid)
                    """
                ),
                {"id": r["id"], "p": json.dumps(payload)},
            )
            updated += 1
    return {"updated": updated}


# ============================================================================
# 6.5 Derived gem signal (popularity-aware "actually hidden" flag)
# ============================================================================

# Outdoor poi_types worth surfacing as "hidden gem" candidates. Excludes
# generic terrain (valley/basin/flat) and utility (campsite/trail/picnic).
_GEM_ELIGIBLE_TYPES = {
    "arch", "waterfall", "spring", "hot_spring", "slot_canyon",
    "scenic_overlook", "summit", "pillar", "cliff", "cave",
    "petroglyph_site", "dinosaur_track", "dark_sky_spot",
    "historic_settlement", "swimming_hole", "hidden_gem",
}


def compute_derived_gems() -> dict[str, int]:
    """Flag master_places.metadata_tags.derived_gem = true on rows that are
    multi-source confirmed AND rarely photographed AND not locationscout-
    endorsed AND of an interesting outdoor type. Distinct from
    `is_hidden_gem` (which is curator-driven).
    """
    eligible_set = "ARRAY[" + ",".join(f"'{t}'" for t in _GEM_ELIGIBLE_TYPES) + "]"

    with session_scope() as s:
        # Reset prior derived_gem stamps.
        s.execute(
            text(
                "UPDATE master_places "
                "SET metadata_tags = metadata_tags - 'derived_gem' "
                "WHERE metadata_tags ? 'derived_gem'"
            )
        )
        result = s.execute(
            text(
                f"""
                UPDATE master_places
                SET metadata_tags = metadata_tags
                  || jsonb_build_object('derived_gem', true)
                WHERE source_count >= 2
                  AND COALESCE(photo_count, 0) <= 2
                  AND NOT locationscout_endorsed
                  AND poi_type = ANY({eligible_set})
                """
            )
        )
        flagged = result.rowcount or 0
        total = s.execute(text("SELECT count(*) FROM master_places")).scalar_one()

    return {"derived_gem_count": flagged, "of_total": total}

VISION_SYSTEM_PROMPT = (
    "You are looking at a real photograph from Wikimedia Commons of a Utah "
    "outdoor location near Moab. Output a structured description of what is "
    "visible AND what someone would experience visiting. Be neutral and "
    "specific; do NOT invent facts not visible.\n\n"
    "Always call the extract_visual_metadata tool exactly once."
)


def _vision_tool_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "description": {
                "type": "string",
                "description": "1-2 sentences (~30 words) describing the scene + what you'd experience there.",
            },
            "scene_features": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Visible elements: 'sandstone arch', 'mesa', 'slickrock', 'desert vegetation', 'river', 'shaded canyon walls', 'distant peaks', etc.",
            },
            "best_time_of_day": {
                "type": "array",
                "items": {
                    "type": "string",
                    "enum": ["sunrise", "morning", "midday", "afternoon", "sunset", "blue_hour", "night"],
                },
                "description": "Which times produce the best photographic light here. Empty if not strongly time-dependent.",
            },
            "best_season": {
                "type": "array",
                "items": {
                    "type": "string",
                    "enum": ["spring", "summer", "autumn", "winter"],
                },
            },
            "effort_to_reach": {
                "type": "string",
                "enum": ["roadside", "easy_walk", "moderate_hike", "strenuous_hike", "technical", "unknown"],
            },
            "crowd_likelihood": {
                "type": "string",
                "enum": ["low", "moderate", "high", "unknown"],
                "description": "From visible signs (paved trail, rails, large parking, infrastructure → high; remote, unmarked, no infrastructure → low).",
            },
        },
        "required": ["description", "scene_features", "effort_to_reach", "crowd_likelihood"],
    }


@dataclass
class _VisionInput:
    master_id: str
    name: str
    poi_type: str
    thumb_url: str


def _fetch_image_bytes(url: str) -> tuple[bytes, str] | None:
    try:
        r = requests.get(
            url,
            headers={"User-Agent": "roamswild-utah-pilot/0.1 (hello@roamswild.app)"},
            timeout=30,
        )
        r.raise_for_status()
    except Exception:
        return None
    ct = (r.headers.get("Content-Type") or "image/jpeg").split(";")[0].strip()
    if ct not in ("image/jpeg", "image/png", "image/gif", "image/webp"):
        ct = "image/jpeg"
    return r.content, ct


def enrich_with_vision(
    only_min_sources: int = 3,
    limit: int | None = None,
) -> dict[str, Any]:
    """Send each master place's thumbnail to Claude Haiku 4.5 vision and
    store the structured response in metadata_tags.vision.
    Default: only places with ``source_count >= 3`` (the 169 high-confidence ones).
    """
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")

    # Build the working set
    with session_scope() as s:
        rows = s.execute(
            text(
                """
                SELECT id::text AS id,
                       canonical_name AS name,
                       poi_type,
                       metadata_tags->'thumbnail'->>'thumb_url' AS thumb_url,
                       metadata_tags ? 'vision' AS already_done
                FROM master_places
                WHERE source_count >= :min_s
                  AND metadata_tags->'thumbnail'->>'thumb_url' IS NOT NULL
                ORDER BY photo_count DESC, source_count DESC
                """
            ),
            {"min_s": only_min_sources},
        ).mappings().all()
    targets = [
        _VisionInput(
            master_id=r["id"], name=r["name"], poi_type=r["poi_type"], thumb_url=r["thumb_url"]
        )
        for r in rows
        if not r["already_done"]
    ]
    if limit:
        targets = targets[:limit]

    import anthropic  # lazy import

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    budget = Budget(cap_usd=settings.budget_cap)
    processed = 0
    cache_hits = 0  # we don't disk-cache vision yet
    failures = 0

    schema = _vision_tool_schema()

    for t in targets:
        img = _fetch_image_bytes(t.thumb_url)
        if img is None:
            failures += 1
            continue
        img_bytes, media_type = img

        try:
            response = client.messages.create(
                model=settings.anthropic_model,
                max_tokens=600,
                system=[{"type": "text", "text": VISION_SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
                tools=[
                    {
                        "name": "extract_visual_metadata",
                        "description": "Return structured visual metadata for the place pictured.",
                        "input_schema": schema,
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                tool_choice={"type": "tool", "name": "extract_visual_metadata"},
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": media_type,
                                    "data": base64.b64encode(img_bytes).decode("ascii"),
                                },
                            },
                            {
                                "type": "text",
                                "text": f"This is a photograph of: {t.name} (poi_type: {t.poi_type}, near Moab, Utah).",
                            },
                        ],
                    }
                ],
            )
        except BudgetExceeded as exc:
            print(f"[vision] HALT: {exc}")
            break
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(f"[vision] failure on {t.name}: {exc}")
            continue

        extracted: dict[str, Any] | None = None
        for block in response.content:
            if getattr(block, "type", None) == "tool_use" and getattr(block, "name", "") == "extract_visual_metadata":
                extracted = dict(block.input)
                break
        if extracted is None:
            failures += 1
            continue

        usage_obj = response.usage
        usage = TokenUsage(
            input_tokens=getattr(usage_obj, "input_tokens", 0) or 0,
            output_tokens=getattr(usage_obj, "output_tokens", 0) or 0,
            cache_write_tokens=getattr(usage_obj, "cache_creation_input_tokens", 0) or 0,
            cache_read_tokens=getattr(usage_obj, "cache_read_input_tokens", 0) or 0,
        )
        try:
            budget.record(settings.anthropic_model, usage)
        except BudgetExceeded as exc:
            print(f"[vision] BUDGET HALT: {exc}")
            break

        with session_scope() as s:
            s.execute(
                text(
                    """
                    UPDATE master_places
                    SET metadata_tags = metadata_tags
                      || jsonb_build_object('vision', CAST(:p AS jsonb))
                    WHERE id = CAST(:id AS uuid)
                    """
                ),
                {"id": t.master_id, "p": json.dumps(extracted, default=str)},
            )
        processed += 1

    return {
        "candidates": len(targets),
        "processed": processed,
        "failures": failures,
        "spent_usd": round(budget.spent_usd, 4),
        "calls": budget.calls,
    }


# ============================================================================
# Orchestrator
# ============================================================================

def run_all(min_sources_for_vision: int = 3) -> dict[str, Any]:
    summary: dict[str, Any] = {}
    print("[1/7] Reddit-snippet cross-link…")
    summary["reddit"] = link_reddit_signals()
    print("[2/7] Activity tags…")
    summary["activity_tags"] = derive_activity_tags()
    print("[3/7] Crowdedness heuristic…")
    summary["crowdedness"] = compute_crowdedness()
    print("[4/7] Wikimedia thumbnails…")
    summary["thumbnails"] = resolve_thumbnails()
    print("[5/7] Sun ephemeris…")
    summary["sun"] = compute_sun_ephemeris()
    print("[6/7] Nearby spots…")
    summary["nearby"] = compute_nearby()
    print(f"[7/7] Vision LLM (source_count >= {min_sources_for_vision})…")
    summary["vision"] = enrich_with_vision(only_min_sources=min_sources_for_vision)
    return summary
