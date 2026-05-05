"""Pull UGRC's ``OpenSourcePlaces`` — a cleaned, structured Utah subset of
OpenStreetMap with stable ``osm_id`` per row and normalized columns
(``category``, ``tourism``, ``amenity``, ``shop``, ``website``, etc.).

We pull ALL features in the Moab radius without a category filter so the
recommendation engine can decide later what's signal vs noise. The osm_id
is preserved as ``source_external_id`` (prefixed) so we never re-insert.
Source label is ``ugrc_osp`` to keep it distinguishable from our
Overpass-based ``osm`` rows during the dedup pass.
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
from utah_engine.ugrc import bbox_from_radius

URL = (
    "https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/"
    "OpenSourcePlaces/FeatureServer/0/query"
)

# Map UGRC OSP categories → our poi_type vocabulary. Anything not listed
# falls through to the lowercased category itself; we keep the wide net
# now and prune in the recommendation layer later.
_CATEGORY_MAP = {
    "viewpoint": "scenic_overlook",
    "attraction": "other_landmark",
    "archaeological": "petroglyph_site",
    "camp_site": "campsite",
    "caravan_site": "campsite",
    "picnic_site": "picnic_site",
    "park": "other_landmark",
    "ruins": "other_landmark",
    "wilderness_hut": "other_landmark",
    "shelter": "other_landmark",
    "tourist_info": "info",
    "museum": "museum",
    "graveyard": "graveyard",
    "gift_shop": "commercial",
    "outdoor_shop": "commercial",
    "restaurant": "commercial",
    "fast_food": "commercial",
    "cafe": "commercial",
    "pub": "commercial",
    "hotel": "lodging",
    "motel": "lodging",
    "guesthouse": "lodging",
    "building": "building",
    "school": "civic",
    "police": "civic",
    "fire_station": "civic",
    "post_office": "civic",
    "bank": "commercial",
    "supermarket": "commercial",
    "convenience": "commercial",
    "charging_station": "infrastructure",
    "airport": "infrastructure",
    "car_rental": "commercial",
    "bicycle_shop": "commercial",
    "clothes": "commercial",
    "laundry": "commercial",
    "community_centre": "civic",
    "sports_centre": "civic",
    "christian": "religious",
    "cinema": "commercial",
    "travel_agent": "commercial",
}


def _to_poi_type(category: str | None, tourism: str | None) -> str:
    if category:
        mapped = _CATEGORY_MAP.get(category.strip().lower())
        if mapped:
            return mapped
        return category.strip().lower().replace(" ", "_")
    if tourism:
        return _CATEGORY_MAP.get(tourism.strip().lower(), tourism.strip().lower())
    return "other_landmark"


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def _fetch_page(bbox_param: str, offset: int, page_size: int) -> dict[str, Any]:
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
    r = requests.get(URL, params=params, timeout=60)
    r.raise_for_status()
    return r.json()


def _iter_features(bbox_param: str, page_size: int = 1000) -> Iterator[dict[str, Any]]:
    offset = 0
    while True:
        page = _fetch_page(bbox_param, offset, page_size)
        feats = page.get("features", []) or []
        if not feats:
            return
        for feat in feats:
            yield feat
        if len(feats) < page_size:
            return
        offset += page_size


def ingest_open_source_places(radius_mi: float | None = None) -> dict[str, int]:
    radius = radius_mi or settings.radius_mi
    bbox = bbox_from_radius(settings.moab_lat, settings.moab_lng, radius)
    bbox_param = bbox.as_param()

    kept = 0
    skipped = 0
    seen: set[str] = set()

    with session_scope() as s:
        for feat in _iter_features(bbox_param):
            props: dict[str, Any] = feat.get("properties") or {}
            geom_json: dict[str, Any] | None = feat.get("geometry")
            if not geom_json:
                skipped += 1
                continue

            osm_id = str(props.get("osm_id") or props.get("OBJECTID") or "").strip()
            if not osm_id:
                skipped += 1
                continue
            external_id = f"ugrc-osp-{osm_id}"
            if external_id in seen:
                continue
            seen.add(external_id)

            name = (props.get("name") or "").strip()
            if not name:
                # Many building / parking / shop rows are nameless; they'd be
                # noise in the recommendation engine. Drop them.
                skipped += 1
                continue

            try:
                lat = float(props.get("lat") or geom_json.get("coordinates", [None, None])[1])
                lng = float(props.get("lon") or geom_json.get("coordinates", [None, None])[0])
            except Exception:
                skipped += 1
                continue
            point = Point(lng, lat)

            category = props.get("category")
            tourism = props.get("tourism")
            poi_type = _to_poi_type(category, tourism)

            metadata_tags: dict[str, Any] = {
                "osp_attributes": props,
                "osp_category": category,
                "osp_tourism": tourism,
                "osp_amenity": props.get("amenity"),
                "osp_shop": props.get("shop"),
                "osp_county": props.get("county"),
                "osp_city": props.get("city"),
                "osp_website": props.get("website"),
                "osp_phone": props.get("phone"),
                "osp_open_hours": props.get("open_hours"),
            }

            stmt = (
                insert(UtahPOI)
                .values(
                    name=name,
                    geom=from_shape(point, srid=4326),
                    poi_type=poi_type,
                    source="ugrc_osp",
                    source_url=f"https://www.openstreetmap.org/{osm_id}"
                    if osm_id.startswith(("node", "way", "relation"))
                    else None,
                    source_external_id=external_id,
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
