"""Pull GNIS named natural features intersecting the Moab radius.

USGS publishes the Geographic Names Information System (GNIS) as an
ArcGIS map service. We pull two layers — Landforms (arches, summits,
cliffs, pillars, ridges, valleys) and Other Hydrographic Features
(springs, falls, lakes, rapids) — and land them as ``utah_poi`` rows
with ``source='gnis'``. Each feature's class is normalized into our
``poi_type`` vocabulary.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Iterator

import requests
from geoalchemy2.shape import from_shape
from shapely.geometry import Point, shape
from sqlalchemy.dialects.postgresql import insert
from tenacity import retry, stop_after_attempt, wait_exponential

from utah_engine.config import settings
from utah_engine.db import session_scope
from utah_engine.models import UtahPOI
from utah_engine.ugrc import bbox_from_radius

GNIS_BASE = "https://carto.nationalmap.gov/arcgis/rest/services/geonames/MapServer"


@dataclass(frozen=True)
class GNISLayer:
    layer_id: int
    label: str


# Layers worth pulling for outdoor recreation. Layer 5 = Landforms,
# Layer 7 = Other Hydrographic Features. Streams/Mouth (6), Cultural (12)
# and Historical (14) are excluded — too generic / too sparse for Moab.
LAYERS: tuple[GNISLayer, ...] = (
    GNISLayer(5, "Landforms"),
    GNISLayer(7, "Hydro"),
)


# Map GNIS feature class -> our poi_type vocabulary. Values that aren't
# already in PoiTypeLiteral fall through to that string anyway (the column
# is Text); the Literal only matters for LLM extraction.
_FEATURECLASS_MAP: dict[str, str] = {
    "Arch": "arch",
    "Summit": "summit",
    "Pillar": "pillar",
    "Cliff": "cliff",
    "Falls": "waterfall",
    "Spring": "spring",
    "Bend": "river_bend",
    "Basin": "basin",
    "Ridge": "ridge",
    "Gap": "pass",
    "Range": "mountain_range",
    "Valley": "valley",
    "Lake": "lake",
    "Rapids": "rapids",
    "Reservoir": "reservoir",
    "Bar": "river_bar",
    "Bench": "bench",
    "Plain": "plain",
    "Slope": "slope",
    "Flat": "flat",
    "Area": "other_landmark",
}


def _normalize_poi_type(feature_class: str | None) -> str:
    if not feature_class:
        return "other_landmark"
    return _FEATURECLASS_MAP.get(feature_class.strip(), feature_class.strip().lower().replace(" ", "_"))


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def _fetch_page(layer_id: int, bbox_param: str, offset: int, page_size: int) -> dict[str, Any]:
    url = f"{GNIS_BASE}/{layer_id}/query"
    params = {
        "where": "state_alpha='UT'",
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


def _iter_features(layer_id: int, bbox_param: str, page_size: int = 1000) -> Iterator[dict[str, Any]]:
    offset = 0
    while True:
        page = _fetch_page(layer_id, bbox_param, offset, page_size)
        feats = page.get("features", []) or []
        if not feats:
            return
        for feat in feats:
            yield feat
        if len(feats) < page_size:
            return
        offset += page_size


def _to_point(geom_json: dict[str, Any]) -> Point | None:
    try:
        shp = shape(geom_json)
    except Exception:
        return None
    if isinstance(shp, Point):
        return shp
    if hasattr(shp, "centroid"):
        return shp.centroid
    return None


def _is_slot_canyon(name: str | None, feature_class: str | None) -> bool:
    """Heuristic: the GNIS class 'Valley' covers everything from broad valleys
    to slot canyons. Promote slot-canyon-ish names to a more specific type so
    the recommendation engine can surface them as scenic spots.
    """
    if feature_class != "Valley" or not name:
        return False
    n = name.lower()
    # Common slot-canyon / narrows naming patterns.
    return any(
        token in n
        for token in (
            "slot",
            "narrows",
            "slick rock",
            "slickrock",
            "canyon",  # most named "Valley" rows in Utah desert are canyons
        )
    )


def ingest_gnis(
    radius_mi: float | None = None,
    layers: Iterable[GNISLayer] = LAYERS,
    limit: int = 0,
) -> dict[str, int]:
    """Returns {layer_label: kept_count}."""
    radius = radius_mi or settings.radius_mi
    bbox = bbox_from_radius(settings.moab_lat, settings.moab_lng, radius)
    bbox_param = bbox.as_param()

    counts: dict[str, int] = {}
    seen_ids: set[str] = set()

    with session_scope() as s:
        for layer in layers:
            kept = 0
            for feat in _iter_features(layer.layer_id, bbox_param):
                props: dict[str, Any] = feat.get("properties") or {}
                geom_json: dict[str, Any] | None = feat.get("geometry")
                if not geom_json:
                    continue

                gaz_id = str(props.get("gaz_id") or props.get("OBJECTID") or "").strip()
                if not gaz_id or gaz_id in seen_ids:
                    continue
                seen_ids.add(gaz_id)

                name = (props.get("gaz_name") or "").strip()
                if not name:
                    continue

                feature_class = props.get("gaz_featureclass")
                point = _to_point(geom_json)
                if point is None or point.is_empty:
                    continue

                if _is_slot_canyon(name, feature_class) and "canyon" in name.lower() and "slot" in name.lower():
                    poi_type = "slot_canyon"
                else:
                    poi_type = _normalize_poi_type(feature_class)

                # Hot springs need name disambiguation — GNIS uses 'Spring'
                # generically for any source, hot or cold.
                if poi_type == "spring" and "hot" in name.lower():
                    poi_type = "hot_spring"

                metadata_tags: dict[str, Any] = {
                    "gnis_attributes": props,
                    "gnis_feature_class": feature_class,
                    "gnis_layer": layer.label,
                    "gnis_county": props.get("county_name"),
                }

                stmt = (
                    insert(UtahPOI)
                    .values(
                        name=name,
                        geom=from_shape(point, srid=4326),
                        poi_type=poi_type,
                        source="gnis",
                        source_url=f"https://geonames.usgs.gov/apex/f?p=gnispq:3:::NO::P3_FID:{gaz_id}",
                        source_external_id=gaz_id,
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

                if limit and kept >= limit:
                    break

            counts[layer.label] = kept
            if limit and kept >= limit:
                break

    return counts
