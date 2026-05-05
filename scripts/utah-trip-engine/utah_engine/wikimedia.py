"""Annotate POIs with Wikimedia Commons photo density.

For each ``utah_poi`` row in the Moab radius, store:
  metadata_tags.wikimedia = {
    photo_count, samples[], checked_at
  }

Strategy: rather than 3,800 per-POI Geosearch calls, we tile the Moab
bbox into 10km cells (Wikimedia's gsradius max), pull every CC-licensed
geotagged photo, then assign each photo to the nearest POI within a
configurable radius (default 300m). One pass over the dataset.
"""
from __future__ import annotations

import math
import time
from datetime import datetime, timezone
from typing import Any

import requests
from sqlalchemy import text
from tenacity import retry, stop_after_attempt, wait_exponential

from utah_engine.config import settings
from utah_engine.db import session_scope
from utah_engine.ugrc import bbox_from_radius

API = "https://commons.wikimedia.org/w/api.php"
UA = "roamswild-utah-pilot/0.1 (hello@roamswild.app)"

# Wikimedia Commons gsradius max is 10000m. We tile with overlapping 10km
# cells; spacing of 12km in degrees-ish would just miss photos so we use
# 0.18 deg lat (~20km) — call radius covers half-cell + half-cell.
CELL_LAT_DEG = 0.18
CELL_LNG_DEG = 0.20


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def _geosearch(lat: float, lng: float, radius_m: int = 10000, limit: int = 500) -> list[dict[str, Any]]:
    r = requests.get(
        API,
        params={
            "action": "query",
            "list": "geosearch",
            "gsradius": radius_m,
            "gscoord": f"{lat}|{lng}",
            "gsnamespace": 6,  # File: namespace
            "gslimit": limit,
            "format": "json",
        },
        headers={"User-Agent": UA},
        timeout=30,
    )
    r.raise_for_status()
    return r.json().get("query", {}).get("geosearch", []) or []


def _iter_grid(lat0: float, lat1: float, lng0: float, lng1: float):
    lat = lat0
    while lat < lat1:
        lng = lng0
        while lng < lng1:
            yield lat + CELL_LAT_DEG / 2, lng + CELL_LNG_DEG / 2
            lng += CELL_LNG_DEG
        lat += CELL_LAT_DEG


def harvest_photos(
    radius_mi: float | None = None,
    throttle_s: float = 0.4,
) -> list[dict[str, Any]]:
    """Walk a grid over the Moab radius, collect Commons photos."""
    radius = radius_mi or settings.radius_mi
    bbox = bbox_from_radius(settings.moab_lat, settings.moab_lng, radius)

    seen: dict[int, dict[str, Any]] = {}
    cells = list(_iter_grid(bbox.ymin, bbox.ymax, bbox.xmin, bbox.xmax))
    for i, (clat, clng) in enumerate(cells):
        try:
            photos = _geosearch(clat, clng)
        except Exception as exc:  # noqa: BLE001
            print(f"[wikimedia] cell {i+1}/{len(cells)} ({clat:.3f},{clng:.3f}): err {exc}")
            continue
        for p in photos:
            pid = p.get("pageid")
            if pid is None or pid in seen:
                continue
            seen[pid] = {
                "page_id": pid,
                "title": p.get("title"),
                "lat": p.get("lat"),
                "lng": p.get("lon"),
            }
        if (i + 1) % 5 == 0:
            print(f"[wikimedia] {i+1}/{len(cells)} cells, {len(seen)} unique photos")
        time.sleep(throttle_s)

    return list(seen.values())


def assign_to_pois(photos: list[dict[str, Any]], cluster_radius_m: float = 300.0) -> dict[str, int]:
    """For each photo, find the nearest POI within ``cluster_radius_m`` and
    aggregate counts + sample titles into metadata_tags.wikimedia.
    """
    # Build per-POI accumulator: {poi_id: [(distance, title, page_id), ...]}
    accum: dict[str, list[tuple[float, str, int]]] = {}

    with session_scope() as s:
        for ph in photos:
            row = s.execute(
                text(
                    """
                    SELECT id::text AS id,
                           ST_Distance(geom::geography,
                                       ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography) AS dist_m
                    FROM utah_poi
                    WHERE source != 'ugrc'
                      AND ST_DWithin(geom::geography,
                                     ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                                     :rad)
                    ORDER BY dist_m
                    LIMIT 1
                    """
                ),
                {"lat": ph["lat"], "lng": ph["lng"], "rad": cluster_radius_m},
            ).first()
            if row is None:
                continue
            accum.setdefault(row.id, []).append((float(row.dist_m), ph["title"], ph["page_id"]))

        for poi_id, entries in accum.items():
            entries.sort()  # nearest first
            samples = [
                {
                    "title": title,
                    "distance_m": round(dist, 1),
                    "url": f"https://commons.wikimedia.org/?curid={pid}",
                }
                for dist, title, pid in entries[:5]
            ]
            payload = {
                "photo_count": len(entries),
                "samples": samples,
                "checked_at": datetime.now(timezone.utc).isoformat(),
                "cluster_radius_m": cluster_radius_m,
            }
            s.execute(
                text(
                    """
                    UPDATE utah_poi
                    SET metadata_tags = metadata_tags
                      || jsonb_build_object('wikimedia', CAST(:p AS jsonb))
                    WHERE id = CAST(:id AS uuid)
                    """
                ),
                {"id": poi_id, "p": _json(payload)},
            )

    return {
        "photos_total": len(photos),
        "pois_with_photos": len(accum),
        "photos_assigned": sum(len(v) for v in accum.values()),
    }


def _json(p: Any) -> str:
    import json
    return json.dumps(p, default=str)
