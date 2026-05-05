"""Promote unmatched community snippets to standalone POIs.

A snippet ends up here if the matcher couldn't link it to a UGRC trail.
We promote it into `utah_poi` (so the trip engine can return it in
'near Moab' queries) only if we can place it on the map. Coordinate
priority:

  1. The snippet's own lat/lng (some scrapers like Atlas Obscura supply them).
  2. Centroid of a region whose name fuzzy-matches an LLM `mentioned_place`.
     ("Sand Flats" → SRMA polygon centroid.)

If neither yields coordinates, the snippet stays unpromoted (no map pin
without a plausible location). Flag is_hidden_gem when the source carries
that semantic (Atlas Obscura) or the text uses "hidden / secret / off the
radar" language.
"""
from __future__ import annotations

import re
import uuid
from typing import Any

from rapidfuzz import fuzz
from sqlalchemy import select, text, update

from utah_engine.db import session_scope
from utah_engine.models import PilotRegion, Snippet

REGION_FUZZ_THRESHOLD = 78
HIDDEN_GEM_PATTERN = re.compile(
    r"\b(hidden|secret|off[- ]the[- ]radar|under[- ]the[- ]radar|nobody knows|locals only)\b",
    re.IGNORECASE,
)


def _region_index(s) -> list[tuple[str, str, float, float]]:
    rows = s.execute(
        text(
            """
            SELECT id::text, name, ST_Y(center), ST_X(center)
            FROM pilot_regions
            """
        )
    ).all()
    return [(rid, name, lat, lng) for (rid, name, lat, lng) in rows]


def _coords_from_region(
    mentioned: list[str], regions: list[tuple[str, str, float, float]]
) -> tuple[float, float, str] | None:
    best: tuple[int, str, float, float, str] | None = None
    for mention in mentioned:
        m = mention.strip()
        if len(m) < 4:
            continue
        for _rid, name, lat, lng in regions:
            score = int(fuzz.token_set_ratio(m, name))
            if score >= REGION_FUZZ_THRESHOLD and (best is None or score > best[0]):
                best = (score, name, lat, lng, m)
    if best:
        _score, region_name, lat, lng, _m = best
        return lat, lng, region_name
    return None


def _is_hidden_gem(source: str, text_blob: str) -> bool:
    if "atlas_obscura" in source.lower():
        return True
    return bool(HIDDEN_GEM_PATTERN.search(text_blob))


def run_classifier() -> dict[str, int]:
    counts = {"promoted": 0, "skipped_no_geom": 0, "skipped_no_type": 0}

    with session_scope() as s:
        regions = _region_index(s)

        rows = s.execute(
            select(
                Snippet.id,
                Snippet.source,
                Snippet.source_url,
                Snippet.name,
                Snippet.raw_text,
                Snippet.lat,
                Snippet.lng,
                Snippet.enrichment,
            ).where(
                Snippet.enriched_at.isnot(None),
                Snippet.matched_poi_id.is_(None),
                Snippet.promoted_poi_id.is_(None),
                # Ambiguous snippets correspond to a UGRC trail we already
                # have (just split across multiple segments) — skip rather
                # than create duplicate standalone POIs.
                ~Snippet.enrichment.has_key("match_ambiguous"),  # noqa: W601
            )
        ).all()

        for (
            snippet_id,
            source,
            source_url,
            snip_name,
            raw_text,
            lat,
            lng,
            enrichment,
        ) in rows:
            enrichment = enrichment or {}
            poi_type = enrichment.get("poi_type")
            if not poi_type:
                counts["skipped_no_type"] += 1
                continue

            extracted_name = enrichment.get("name") or snip_name or "Unnamed Moab-area POI"
            mentioned = enrichment.get("mentioned_places") or []

            place_lat: float | None = float(lat) if lat is not None else None
            place_lng: float | None = float(lng) if lng is not None else None
            placement_via = "snippet_coords"

            if place_lat is None or place_lng is None:
                hit = _coords_from_region(mentioned, regions)
                if hit is not None:
                    place_lat, place_lng, region_name = hit
                    placement_via = f"region_centroid:{region_name}"

            if place_lat is None or place_lng is None:
                counts["skipped_no_geom"] += 1
                continue

            new_id = uuid.uuid4()
            metadata_tags: dict[str, Any] = {
                "community_enrichment": enrichment,
                "snippet_id": str(snippet_id),
                "placement_via": placement_via,
                "summary": enrichment.get("summary"),
                "best_time": enrichment.get("best_time"),
                "scenic_score": enrichment.get("scenic_score"),
                "vehicle_requirements": enrichment.get("vehicle_requirements"),
                "danger_tags": enrichment.get("danger_tags"),
                "difficulty_rating": enrichment.get("difficulty_rating"),
                "source_excerpt": (raw_text or "")[:500],
            }

            primary_use = enrichment.get("primary_use")
            is_gem = _is_hidden_gem(source, raw_text or "") or poi_type == "hidden_gem"

            s.execute(
                text(
                    """
                    INSERT INTO utah_poi
                        (id, name, geom, poi_type, primary_use, source, source_url,
                         source_external_id, is_hidden_gem, metadata_tags)
                    VALUES (
                        :id,
                        :name,
                        ST_SetSRID(ST_MakePoint(:lng, :lat), 4326),
                        :poi_type,
                        :primary_use,
                        :source,
                        :source_url,
                        :ext_id,
                        :is_gem,
                        cast(:meta as jsonb)
                    )
                    ON CONFLICT (source, source_external_id) DO NOTHING
                    """
                ),
                {
                    "id": new_id,
                    "name": extracted_name[:200],
                    "lng": place_lng,
                    "lat": place_lat,
                    "poi_type": poi_type,
                    "primary_use": primary_use,
                    "source": source,
                    "source_url": source_url,
                    "ext_id": str(snippet_id),
                    "is_gem": is_gem,
                    "meta": _json_dump(metadata_tags),
                },
            )
            s.execute(
                update(Snippet)
                .where(Snippet.id == snippet_id)
                .values(promoted_poi_id=new_id)
            )
            counts["promoted"] += 1

    return counts


def _json_dump(payload: dict[str, Any]) -> str:
    import json

    return json.dumps(payload, default=str)
