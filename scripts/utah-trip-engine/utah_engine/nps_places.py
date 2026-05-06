"""Pull within-park named POIs from the NPS Developer API.

NPS publishes ``/api/v1/places`` returning park-internal POIs (overlooks,
trailheads, exhibits, scenic drives, named viewpoints) with descriptions
and lat/lng. We filter by parkCode for the Moab-area parks.

Uses ``DEMO_KEY`` by default (rate-limited but works); set NPS_API_KEY in
``.env`` for full quota.
"""
from __future__ import annotations

from typing import Any, Iterator

import requests
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy.dialects.postgresql import insert
from tenacity import retry, stop_after_attempt, wait_exponential

from utah_engine.config import settings
from utah_engine.db import session_scope
from utah_engine.models import UtahPOI

API_URL = "https://developer.nps.gov/api/v1/places"

# Park codes within (or just outside) the Moab radius. We post-filter by
# distance so even outliers (e.g. Hovenweep just over 50mi) are dropped.
PARK_CODES = (
    "arch",   # Arches NP
    "cany",   # Canyonlands NP
    "glca",   # Glen Canyon NRA
    "nabr",   # Natural Bridges NM
    "hove",   # Hovenweep NM
    "cebr",   # Cedar Breaks NM (likely outside)
)

# Map common NPS place types -> our poi_type vocabulary.
_NPS_TYPE_MAP: dict[str, str] = {
    "overlook": "scenic_overlook",
    "viewpoint": "scenic_overlook",
    "trailhead": "trailhead",
    "trail": "trail",
    "campground": "campsite",
    "campsite": "campsite",
    "picnic": "picnic_site",
    "picnic area": "picnic_site",
    "scenic drive": "scenic_drive",
    "visitor center": "visitor_center",
    "ranger station": "visitor_center",
    "amphitheater": "amphitheater",
    "historic": "other_landmark",
}


def _normalize_type(title: str, description: str | None) -> str:
    blob = f"{title} {description or ''}".lower()
    for keyword, canon in _NPS_TYPE_MAP.items():
        if keyword in blob:
            return canon
    return "other_landmark"


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def _fetch_page(park_code: str, start: int, limit: int, api_key: str) -> dict[str, Any]:
    r = requests.get(
        API_URL,
        params={"parkCode": park_code, "limit": limit, "start": start, "api_key": api_key},
        timeout=30,
        headers={"User-Agent": "roamswild-pilot/0.1"},
    )
    r.raise_for_status()
    return r.json()


def _iter_places(park_code: str, api_key: str, page_size: int = 50) -> Iterator[dict[str, Any]]:
    start = 0
    while True:
        page = _fetch_page(park_code, start, page_size, api_key)
        items = page.get("data", []) or []
        if not items:
            return
        for it in items:
            yield it
        start += len(items)
        total = int(page.get("total") or 0)
        if start >= total:
            return


def ingest_nps_places(park_codes: tuple[str, ...] = PARK_CODES) -> dict[str, int]:
    api_key = settings.nps_api_key or "DEMO_KEY"

    kept = 0
    skipped_no_geo = 0
    skipped_outside = 0
    counts_by_park: dict[str, int] = {}

    with session_scope() as s:
        for pc in park_codes:
            pc_kept = 0
            for it in _iter_places(pc, api_key):
                lat_raw = it.get("latitude")
                lng_raw = it.get("longitude")
                if lat_raw in (None, "") or lng_raw in (None, ""):
                    skipped_no_geo += 1
                    continue
                try:
                    lat = float(lat_raw)
                    lng = float(lng_raw)
                except Exception:
                    skipped_no_geo += 1
                    continue

                # Distance filter to enforce Moab radius
                from utah_engine.seeded import _haversine_miles
                if _haversine_miles(settings.moab_lat, settings.moab_lng, lat, lng) > settings.radius_mi:
                    skipped_outside += 1
                    continue

                external_id = str(it.get("id") or "").strip()
                if not external_id:
                    continue

                title = (it.get("title") or "").strip()
                description = (it.get("listingDescription") or it.get("bodyText") or "").strip()
                poi_type = _normalize_type(title, description)

                metadata_tags: dict[str, Any] = {
                    "nps_park_code": pc,
                    "nps_url": it.get("url"),
                    "nps_id": external_id,
                    "summary": description[:500] if description else None,
                    "images": it.get("images") or [],
                }

                stmt = (
                    insert(UtahPOI)
                    .values(
                        name=title,
                        description=description[:1000] if description else None,
                        geom=from_shape(Point(lng, lat), srid=4326),
                        poi_type=poi_type,
                        source="nps",
                        source_url=it.get("url"),
                        source_external_id=external_id,
                        metadata_tags=metadata_tags,
                    )
                    .on_conflict_do_update(
                        index_elements=["source", "source_external_id"],
                        set_={
                            "name": title,
                            "description": description[:1000] if description else None,
                            "poi_type": poi_type,
                            "geom": from_shape(Point(lng, lat), srid=4326),
                            "metadata_tags": metadata_tags,
                        },
                    )
                )
                s.execute(stmt)
                kept += 1
                pc_kept += 1
            counts_by_park[pc] = pc_kept

    return {
        "kept": kept,
        "skipped_no_geo": skipped_no_geo,
        "skipped_outside_bbox": skipped_outside,
        "by_park": counts_by_park,
    }
