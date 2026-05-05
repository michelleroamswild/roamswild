"""Pull named natural / tourism / historic features from OpenStreetMap.

Uses the public Overpass API. We only keep features with a ``name`` tag —
anonymous arches and unnamed peaks are noise for the recommendation engine.

Each row is inserted with ``source='osm'``. A separate cross-reference
stage (``dedup_against_gnis``) merges OSM tags onto matching GNIS rows
and deletes the OSM duplicate.
"""
from __future__ import annotations

from typing import Any, Iterator

import requests
from geoalchemy2.shape import from_shape
from rapidfuzz import fuzz
from shapely.geometry import Point
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert
from tenacity import retry, stop_after_attempt, wait_exponential

from utah_engine.config import settings
from utah_engine.db import session_scope
from utah_engine.models import UtahPOI
from utah_engine.ugrc import bbox_from_radius

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Mapping OSM tag (key, value) → our poi_type. Order matters when a node
# has multiple matching tags — the first hit wins.
TAG_TO_TYPE: list[tuple[str, str, str]] = [
    ("natural", "arch", "arch"),
    ("waterway", "waterfall", "waterfall"),
    ("natural", "hot_spring", "hot_spring"),
    ("natural", "spring", "spring"),
    ("natural", "peak", "summit"),
    ("natural", "cave_entrance", "cave"),
    ("natural", "cliff", "cliff"),
    ("tourism", "viewpoint", "scenic_overlook"),
    ("tourism", "picnic_site", "picnic_site"),
    ("tourism", "attraction", "other_landmark"),
    ("historic", "archaeological_site", "petroglyph_site"),
    ("historic", "ruins", "other_landmark"),
    ("historic", "rock_art", "petroglyph_site"),
]


def _build_query_for_tag(bbox: tuple[float, float, float, float], key: str, value: str) -> str:
    """Compose a tight Overpass QL query for a single tag.

    Splitting per tag avoids 504s on the public Overpass — the union
    query for all 13 of our tags hits the resource limits.

    Bbox order: (south, west, north, east) per Overpass.
    """
    s, w, n, e = bbox
    return (
        f'[out:json][timeout:60];\n'
        f'node["{key}"="{value}"]["name"]({s},{w},{n},{e});\n'
        f'out;\n'
    )


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=15))
def _overpass(query: str) -> dict[str, Any]:
    r = requests.post(
        OVERPASS_URL,
        data={"data": query},
        timeout=120,
        headers={"User-Agent": "roamswild-utah-pilot/0.1 (contact: hello@roamswild.app)"},
    )
    r.raise_for_status()
    return r.json()


def _classify(tags: dict[str, str]) -> str:
    for key, value, poi_type in TAG_TO_TYPE:
        if tags.get(key) == value:
            return poi_type
    return "other_landmark"


def _iter_elements_all(bbox: tuple[float, float, float, float]) -> Iterator[dict[str, Any]]:
    """Run one Overpass request per tag and yield matching nodes."""
    for key, value, _poi_type in TAG_TO_TYPE:
        query = _build_query_for_tag(bbox, key, value)
        data = _overpass(query)
        for el in data.get("elements", []):
            if el.get("type") != "node":
                continue
            if "lat" not in el or "lon" not in el:
                continue
            if not (el.get("tags") or {}).get("name"):
                continue
            yield el


def ingest_osm(radius_mi: float | None = None) -> int:
    radius = radius_mi or settings.radius_mi
    bbox = bbox_from_radius(settings.moab_lat, settings.moab_lng, radius)
    # Overpass uses (south, west, north, east).
    bbox_tuple = (bbox.ymin, bbox.xmin, bbox.ymax, bbox.xmax)

    kept = 0
    seen: set[str] = set()

    with session_scope() as s:
        for el in _iter_elements_all(bbox_tuple):
            osm_id = f"osm-node-{el['id']}"
            if osm_id in seen:
                continue
            seen.add(osm_id)

            tags = el.get("tags") or {}
            name = (tags.get("name") or "").strip()
            if not name:
                continue

            poi_type = _classify(tags)
            point = Point(float(el["lon"]), float(el["lat"]))

            metadata_tags = {"osm_tags": tags, "osm_id": el["id"]}
            description = tags.get("description") or tags.get("note")

            stmt = (
                insert(UtahPOI)
                .values(
                    name=name,
                    description=description,
                    geom=from_shape(point, srid=4326),
                    poi_type=poi_type,
                    source="osm",
                    source_url=f"https://www.openstreetmap.org/node/{el['id']}",
                    source_external_id=osm_id,
                    metadata_tags=metadata_tags,
                )
                .on_conflict_do_update(
                    index_elements=["source", "source_external_id"],
                    set_={
                        "name": name,
                        "description": description,
                        "poi_type": poi_type,
                        "geom": from_shape(point, srid=4326),
                        "metadata_tags": metadata_tags,
                    },
                )
            )
            s.execute(stmt)
            kept += 1

    return kept


GEO_SOURCES = ("gnis", "osm", "ugrc_osp", "nhd")


def mark_cross_references(
    distance_m: float = 250.0,
    name_threshold: int = 78,
    sources: tuple[str, ...] = GEO_SOURCES,
) -> dict[str, Any]:
    """For each pair of geo sources, find rows within ``distance_m`` whose
    names fuzzy-match and append a cross-reference entry on both sides.

    Each ``utah_poi.metadata_tags.cross_refs`` is an array of refs (one per
    matching source) so a feature confirmed by GNIS + OSM + OSP carries two
    refs. Re-running resets all cross_refs first.
    """
    matched_pairs_by_pair: dict[str, int] = {}
    near_miss_by_pair: dict[str, int] = {}
    # poi_id -> list[ref dict] accumulator before bulk write.
    refs_by_poi: dict[str, list[dict[str, Any]]] = {}

    with session_scope() as s:
        # Reset both old single-ref and new array forms so reruns are clean.
        s.execute(
            text(
                "UPDATE utah_poi "
                "SET metadata_tags = (metadata_tags - 'cross_ref') - 'cross_refs' "
                "WHERE source = ANY(:sources) "
                "AND (metadata_tags ? 'cross_ref' OR metadata_tags ? 'cross_refs')"
            ),
            {"sources": list(sources)},
        )

        for i, src_a in enumerate(sources):
            for src_b in sources[i + 1:]:
                pair_key = f"{src_a}<->{src_b}"
                rows = s.execute(
                    text(
                        """
                        SELECT a.id::text AS a_id, a.name AS a_name, a.poi_type AS a_type,
                               b.id::text AS b_id, b.name AS b_name, b.poi_type AS b_type,
                               ST_Distance(a.geom::geography, b.geom::geography) AS dist_m
                        FROM utah_poi a
                        JOIN utah_poi b ON
                          b.source = :src_b
                          AND ST_DWithin(a.geom::geography, b.geom::geography, :dist)
                        WHERE a.source = :src_a
                        """
                    ),
                    {"src_a": src_a, "src_b": src_b, "dist": distance_m},
                ).mappings().all()

                pair_matched = 0
                pair_near = 0
                for r in rows:
                    score = int(fuzz.token_set_ratio(r["a_name"] or "", r["b_name"] or ""))
                    if score < name_threshold:
                        pair_near += 1
                        continue
                    dist = round(float(r["dist_m"]), 1)
                    refs_by_poi.setdefault(r["a_id"], []).append(
                        {
                            "matched_id": r["b_id"],
                            "matched_source": src_b,
                            "matched_name": r["b_name"],
                            "matched_poi_type": r["b_type"],
                            "distance_m": dist,
                            "name_score": score,
                        }
                    )
                    refs_by_poi.setdefault(r["b_id"], []).append(
                        {
                            "matched_id": r["a_id"],
                            "matched_source": src_a,
                            "matched_name": r["a_name"],
                            "matched_poi_type": r["a_type"],
                            "distance_m": dist,
                            "name_score": score,
                        }
                    )
                    pair_matched += 1

                matched_pairs_by_pair[pair_key] = pair_matched
                near_miss_by_pair[pair_key] = pair_near

        # Bulk write the accumulated refs.
        for poi_id, refs in refs_by_poi.items():
            s.execute(
                text(
                    "UPDATE utah_poi "
                    "SET metadata_tags = metadata_tags "
                    "  || jsonb_build_object('cross_refs', CAST(:refs AS jsonb)) "
                    "WHERE id = CAST(:id AS uuid)"
                ),
                {"id": poi_id, "refs": _json_dump(refs)},
            )

        totals = {
            f"{src}_rows": s.execute(
                text("SELECT count(*) FROM utah_poi WHERE source = :s"), {"s": src}
            ).scalar_one()
            for src in sources
        }

    return {
        "matched_pairs": matched_pairs_by_pair,
        "near_miss_proximity_only": near_miss_by_pair,
        "rows_with_cross_refs": len(refs_by_poi),
        **totals,
    }


def _json_dump(payload: Any) -> str:
    import json
    return json.dumps(payload, default=str)
