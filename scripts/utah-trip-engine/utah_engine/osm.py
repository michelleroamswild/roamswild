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


def mark_cross_references(
    distance_m: float = 250.0, name_threshold: int = 78
) -> dict[str, int]:
    """Find (GNIS, OSM) pairs within ``distance_m`` whose names fuzzy-match.

    Both rows are kept. Each side gets a ``metadata_tags.cross_ref`` block
    pointing at the matched row on the other side (id, source, name, distance,
    name-similarity score) so you can see at a glance which features are
    confirmed by both sources.

    Each row's cross_ref is reset at the start of the pass so re-running picks
    up the latest neighborhood.
    """
    matched = 0
    near_miss = 0

    with session_scope() as s:
        # Reset prior cross_ref annotations so reruns reflect current data.
        s.execute(
            text(
                "UPDATE utah_poi SET metadata_tags = metadata_tags - 'cross_ref' "
                "WHERE source IN ('gnis','osm') AND metadata_tags ? 'cross_ref'"
            )
        )

        candidates = s.execute(
            text(
                """
                SELECT gnis.id::text  AS gnis_id,
                       gnis.name      AS gnis_name,
                       gnis.poi_type  AS gnis_type,
                       osm.id::text   AS osm_id,
                       osm.name       AS osm_name,
                       osm.poi_type   AS osm_type,
                       ST_Distance(gnis.geom::geography, osm.geom::geography) AS dist_m
                FROM utah_poi gnis
                JOIN utah_poi osm ON
                  osm.source = 'osm'
                  AND ST_DWithin(gnis.geom::geography, osm.geom::geography, :dist)
                WHERE gnis.source = 'gnis'
                ORDER BY ST_Distance(gnis.geom::geography, osm.geom::geography)
                """
            ),
            {"dist": distance_m},
        ).mappings().all()

        for c in candidates:
            score = int(fuzz.token_set_ratio(c["gnis_name"], c["osm_name"]))
            if score < name_threshold:
                near_miss += 1
                continue

            gnis_ref = {
                "matched_id": c["osm_id"],
                "matched_source": "osm",
                "matched_name": c["osm_name"],
                "matched_poi_type": c["osm_type"],
                "distance_m": round(float(c["dist_m"]), 1),
                "name_score": score,
            }
            osm_ref = {
                "matched_id": c["gnis_id"],
                "matched_source": "gnis",
                "matched_name": c["gnis_name"],
                "matched_poi_type": c["gnis_type"],
                "distance_m": round(float(c["dist_m"]), 1),
                "name_score": score,
            }

            s.execute(
                text(
                    "UPDATE utah_poi "
                    "SET metadata_tags = metadata_tags || jsonb_build_object('cross_ref', CAST(:ref AS jsonb)) "
                    "WHERE id = CAST(:id AS uuid)"
                ),
                {"id": c["gnis_id"], "ref": _json_dump(gnis_ref)},
            )
            s.execute(
                text(
                    "UPDATE utah_poi "
                    "SET metadata_tags = metadata_tags || jsonb_build_object('cross_ref', CAST(:ref AS jsonb)) "
                    "WHERE id = CAST(:id AS uuid)"
                ),
                {"id": c["osm_id"], "ref": _json_dump(osm_ref)},
            )
            matched += 1

        gnis_total = s.execute(text("SELECT count(*) FROM utah_poi WHERE source = 'gnis'")).scalar_one()
        osm_total = s.execute(text("SELECT count(*) FROM utah_poi WHERE source = 'osm'")).scalar_one()

    return {
        "matched_pairs": matched,
        "near_miss_proximity_only": near_miss,
        "gnis_rows": gnis_total,
        "osm_rows": osm_total,
    }


def _json_dump(payload: Any) -> str:
    import json
    return json.dumps(payload, default=str)
