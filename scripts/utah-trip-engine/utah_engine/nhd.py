"""Pull NHD (National Hydrography Dataset) named point features.

USGS NHD Layer 0 — point hydrography features. Most rows in our radius
are springs (FCODE 45800). We keep only those with ``GNIS_NAME`` set,
since unnamed springs are noise for the recommendation engine.
"""
from __future__ import annotations

from typing import Any, Iterator

import requests
from geoalchemy2.shape import from_shape
from shapely.geometry import Point, shape
from sqlalchemy.dialects.postgresql import insert
from tenacity import retry, stop_after_attempt, wait_exponential

from utah_engine.config import settings
from utah_engine.db import session_scope
from utah_engine.models import UtahPOI
from utah_engine.ugrc import bbox_from_radius

NHD_POINT_URL = (
    "https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/0/query"
)

# NHD numeric FCODE (Feature Code) → poi_type. Subset relevant to the
# recommendation engine; rare codes fall through to other_landmark.
_FCODE_MAP: dict[int, str] = {
    45800: "spring",
    48800: "spring",          # Spring or Seep variant
    36700: "spring",          # Spring
    32500: "rapids",
    34300: "lake",             # Reservoir/Lake (mostly named ones)
    39004: "rapids",
    33400: "waterfall",
    39800: "geyser",
    44300: "spring",           # Hot Springs marker code
}


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def _fetch(bbox_param: str, offset: int, page_size: int) -> dict[str, Any]:
    params = {
        "where": "GNIS_NAME IS NOT NULL",
        "geometry": bbox_param,
        "geometryType": "esriGeometryEnvelope",
        "inSR": 4326,
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "*",
        "returnGeometry": "true",
        "outSR": 4326,
        "f": "geojson",
        "resultOffset": offset,
        "resultRecordCount": page_size,
    }
    r = requests.get(NHD_POINT_URL, params=params, timeout=60)
    r.raise_for_status()
    return r.json()


def _iter(bbox_param: str, page_size: int = 1000) -> Iterator[dict[str, Any]]:
    offset = 0
    while True:
        page = _fetch(bbox_param, offset, page_size)
        feats = page.get("features", []) or []
        if not feats:
            return
        for feat in feats:
            yield feat
        if len(feats) < page_size:
            return
        offset += page_size


def ingest_nhd(radius_mi: float | None = None) -> dict[str, int]:
    radius = radius_mi or settings.radius_mi
    bbox = bbox_from_radius(settings.moab_lat, settings.moab_lng, radius)
    bbox_param = bbox.as_param()

    kept = 0
    skipped = 0
    seen: set[str] = set()

    with session_scope() as s:
        for feat in _iter(bbox_param):
            props: dict[str, Any] = feat.get("properties") or {}
            geom_json: dict[str, Any] | None = feat.get("geometry")
            if not geom_json:
                skipped += 1
                continue

            permanent_id = str(props.get("PERMANENT_IDENTIFIER") or "").strip()
            if not permanent_id or permanent_id in seen:
                skipped += 1
                continue
            seen.add(permanent_id)

            name = (props.get("GNIS_NAME") or "").strip()
            if not name:
                skipped += 1
                continue

            try:
                shp = shape(geom_json)
                point = shp if isinstance(shp, Point) else shp.centroid
            except Exception:
                skipped += 1
                continue

            fcode = props.get("FCODE")
            poi_type = _FCODE_MAP.get(int(fcode)) if fcode is not None else None
            if poi_type is None:
                poi_type = "spring"  # NHD point layer is mostly springs by volume

            # Disambiguate hot springs by name
            if poi_type == "spring" and "hot" in name.lower():
                poi_type = "hot_spring"

            metadata_tags: dict[str, Any] = {
                "nhd_attributes": props,
                "nhd_fcode": fcode,
                "nhd_ftype": props.get("FTYPE"),
                "nhd_gnis_id": props.get("GNIS_ID"),
            }

            stmt = (
                insert(UtahPOI)
                .values(
                    name=name,
                    geom=from_shape(point, srid=4326),
                    poi_type=poi_type,
                    source="nhd",
                    source_url="https://hydro.nationalmap.gov/",
                    source_external_id=permanent_id,
                    metadata_tags=metadata_tags,
                )
                .on_conflict_do_update(
                    index_elements=["source", "source_external_id"],
                    set_={
                        "name": name,
                        "poi_type": poi_type,
                        "geom": from_shape(point, srid=4326),
                        "metadata_tags": metadata_tags,
                    },
                )
            )
            s.execute(stmt)
            kept += 1

    return {"kept": kept, "skipped": skipped}
