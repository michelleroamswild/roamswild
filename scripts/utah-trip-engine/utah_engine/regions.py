"""Pull region polygons (NPS, state parks, BLM monuments, USFS forests).

All four sources live in UGRC's ArcGIS Feature Service catalog. Polygons
intersecting the Moab radius bbox become rows in `pilot_regions`. Single-
polygon features are wrapped to MultiPolygon for schema parity with parks
that have detached districts (e.g. Canyonlands Island/Needles/Maze).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Iterator

import requests
from geoalchemy2.shape import from_shape
from shapely.geometry import MultiPolygon, Polygon, shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union
from sqlalchemy.dialects.postgresql import insert
from tenacity import retry, stop_after_attempt, wait_exponential

from utah_engine.config import settings
from utah_engine.db import session_scope
from utah_engine.models import PilotRegion
from utah_engine.ugrc import bbox_from_radius

UGRC_BASE = "https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services"


@dataclass
class RegionSource:
    service: str
    name_field: str
    id_field: str
    default_region_type: str
    type_field: str | None = None  # if set, value mapped via _normalize_region_type


_NPS_TYPE_MAP = {
    "national park": "national_park",
    "national monument": "national_monument",
    "national recreation area": "national_recreation_area",
    "national historic site": "national_historic_site",
    "national historical park": "national_historical_park",
}

_BLM_TYPE_MAP = {
    "monument": "national_monument",
    "national monument": "national_monument",
    "nca": "national_conservation_area",
    "national conservation area": "national_conservation_area",
}


SOURCES: list[RegionSource] = [
    RegionSource(
        service="nps_park_unit_boundaries",
        name_field="UNIT_NAME",
        id_field="UNIT_CODE",
        default_region_type="national_park",
        type_field="UNIT_TYPE",
    ),
    RegionSource(
        service="state_park_boundaries_for_website",
        name_field="label_state",
        id_field="OBJECTID",
        default_region_type="state_park",
    ),
    RegionSource(
        service="BLMNationalMonumentsAndNCAs",
        name_field="NAME",
        id_field="GlobalID",
        default_region_type="national_monument",
        type_field="NLCS_TYPE",
    ),
    RegionSource(
        service="ForestService",
        name_field="FOREST_NAME",
        id_field="FOREST_NUM",
        default_region_type="national_forest",
    ),
]


def _normalize_region_type(source_service: str, raw: str | None, default: str) -> str:
    if not raw:
        return default
    low = raw.strip().lower()
    if "nps" in source_service.lower():
        return _NPS_TYPE_MAP.get(low, default)
    if "blm" in source_service.lower():
        return _BLM_TYPE_MAP.get(low, default)
    return default


def _slugify(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", name.strip().lower()).strip("-")
    return s or "region"


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def _fetch_page(service: str, bbox_param: str, offset: int, page_size: int) -> dict[str, Any]:
    url = f"{UGRC_BASE}/{service}/FeatureServer/0/query"
    params = {
        "where": "1=1",
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
    r = requests.get(url, params=params, timeout=60)
    r.raise_for_status()
    return r.json()


def _iter_features(service: str, bbox_param: str, page_size: int = 500) -> Iterator[dict[str, Any]]:
    offset = 0
    while True:
        page = _fetch_page(service, bbox_param, offset, page_size)
        feats = page.get("features", []) or []
        if not feats:
            return
        for feat in feats:
            yield feat
        if len(feats) < page_size:
            return
        offset += page_size


def _to_multi(geom: BaseGeometry) -> MultiPolygon | None:
    """Coerce a Polygon / MultiPolygon shape into MultiPolygon."""
    if isinstance(geom, MultiPolygon):
        return geom
    if isinstance(geom, Polygon):
        return MultiPolygon([geom])
    if hasattr(geom, "geoms"):
        polys = [g for g in geom.geoms if isinstance(g, Polygon)]
        return MultiPolygon(polys) if polys else None
    return None


def ingest_regions(radius_mi: float | None = None) -> dict[str, int]:
    """Ingest all four region sources. Returns {source_service: kept_count}."""
    radius = radius_mi or settings.radius_mi
    bbox = bbox_from_radius(settings.moab_lat, settings.moab_lng, radius)
    bbox_param = bbox.as_param()

    counts: dict[str, int] = {}

    with session_scope() as s:
        for src in SOURCES:
            # Collect features per external_id so multi-segment regions
            # (e.g. Manti-La Sal NF spans many polygon features keyed by the
            # same FOREST_NUM) get unioned into one MultiPolygon before write.
            grouped: dict[str, dict[str, Any]] = {}

            for feat in _iter_features(src.service, bbox_param):
                props: dict[str, Any] = feat.get("properties") or {}
                geom_json: dict[str, Any] | None = feat.get("geometry")
                if not geom_json:
                    continue

                external_id = str(props.get(src.id_field) or "").strip()
                if not external_id:
                    continue

                shp = shape(geom_json)
                if shp.is_empty:
                    continue

                bucket = grouped.setdefault(
                    external_id,
                    {"props": props, "geoms": []},
                )
                bucket["geoms"].append(shp)

            kept = 0
            for external_id, bucket in grouped.items():
                props = bucket["props"]

                # Pick a real name. Some rows carry placeholders like "<na>",
                # numeric-only ids, or null fields; skip those.
                candidates = [
                    props.get(src.name_field),
                    props.get("label_state"),
                    props.get("full_name"),
                    props.get("UNIT_NAME"),
                    props.get("FOREST_NAME"),
                    props.get("NAME"),
                ]
                name = None
                for c in candidates:
                    if isinstance(c, str):
                        candidate = c.strip()
                        if (
                            candidate
                            and candidate.lower() not in {"<na>", "n/a", "none"}
                            and not candidate.isdigit()
                        ):
                            name = candidate
                            break
                if not name:
                    continue

                merged = unary_union(bucket["geoms"])
                multi = _to_multi(merged)
                if multi is None or multi.is_empty:
                    continue
                centroid = multi.centroid

                region_type = _normalize_region_type(
                    src.service,
                    props.get(src.type_field) if src.type_field else None,
                    src.default_region_type,
                )

                slug = f"{src.service.lower()}-{_slugify(name)}"

                metadata_tags = {
                    "ugrc_attributes": props,
                    "ugrc_service": src.service,
                    "polygon_segments": len(bucket["geoms"]),
                }

                stmt = (
                    insert(PilotRegion)
                    .values(
                        name=name,
                        slug=slug,
                        region_type=region_type,
                        bounds=from_shape(multi, srid=4326),
                        center=from_shape(centroid, srid=4326),
                        source=f"ugrc:{src.service}",
                        source_external_id=external_id,
                        metadata_tags=metadata_tags,
                    )
                    .on_conflict_do_update(
                        index_elements=["source", "source_external_id"],
                        set_={
                            "name": name,
                            "region_type": region_type,
                            "bounds": from_shape(multi, srid=4326),
                            "center": from_shape(centroid, srid=4326),
                            "metadata_tags": metadata_tags,
                        },
                    )
                )
                s.execute(stmt)
                kept += 1
            counts[src.service] = kept

    return counts
