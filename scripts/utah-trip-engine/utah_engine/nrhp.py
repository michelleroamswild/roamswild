"""Pull National Register of Historic Places (NRHP) point listings.

NPS publishes the NRHP locations as an ArcGIS Map Service. Most ghost
towns, petroglyph sites, historic ranches, and old mining operations
land here as Layer 0 (Points). Polygons (Layer 1) are historic
districts; we skip those for now.

We filter to Utah-state listings and the Moab bbox at query time, then
classify by ResType so the /master page can filter by historic-site
flavor.
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

URL = "https://mapservices.nps.gov/arcgis/rest/services/cultural_resources/nrhp_locations/MapServer/0/query"

# Map NRHP ResType → our poi_type vocabulary.
_RESTYPE_MAP = {
    "site": "historic_site",
    "district": "historic_district",
    "structure": "historic_structure",
    "building": "historic_building",
    "object": "historic_object",
}


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def _fetch_page(bbox_param: str, offset: int, page_size: int) -> dict[str, Any]:
    params = {
        "where": "State = 'UTAH'",
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


def _iter(bbox_param: str, page_size: int = 500) -> Iterator[dict[str, Any]]:
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


def ingest_nrhp(radius_mi: float | None = None) -> dict[str, int]:
    radius = radius_mi or settings.radius_mi
    bbox = bbox_from_radius(settings.moab_lat, settings.moab_lng, radius)
    bbox_param = bbox.as_param()

    kept = 0
    skipped = 0
    by_type: dict[str, int] = {}

    with session_scope() as s:
        for feat in _iter(bbox_param):
            props: dict[str, Any] = feat.get("properties") or {}
            geom_json: dict[str, Any] | None = feat.get("geometry")
            if not geom_json:
                skipped += 1
                continue

            ref = str(props.get("NRIS_Refnum") or props.get("OBJECTID") or "").strip()
            if not ref:
                skipped += 1
                continue

            name = (props.get("RESNAME") or "").strip()
            if not name:
                skipped += 1
                continue

            try:
                shp = shape(geom_json)
                point = shp if isinstance(shp, Point) else shp.centroid
            except Exception:
                skipped += 1
                continue

            res_type = (props.get("ResType") or "").strip().lower()
            poi_type = _RESTYPE_MAP.get(res_type, "historic_other")
            by_type[poi_type] = by_type.get(poi_type, 0) + 1

            description_parts: list[str] = []
            if props.get("Address"):
                description_parts.append(str(props["Address"]))
            if props.get("City"):
                description_parts.append(str(props["City"]))
            if props.get("MultiName"):
                description_parts.append(f"theme: {props['MultiName'].strip()}")
            description = " · ".join(p for p in description_parts if p)

            metadata_tags: dict[str, Any] = {
                "nrhp_attributes": props,
                "nrhp_restype": res_type or None,
                "nrhp_is_nhl": props.get("Is_NHL"),
                "nrhp_county": props.get("County"),
                "nrhp_city": props.get("City"),
                "nrhp_cert_date": props.get("CertDate"),
                "summary": description,
            }

            stmt = (
                insert(UtahPOI)
                .values(
                    name=name,
                    description=description or None,
                    geom=from_shape(point, srid=4326),
                    poi_type=poi_type,
                    source="nrhp",
                    source_url=f"https://npgallery.nps.gov/AssetDetail/NRIS/{ref}"
                    if ref.isdigit() else None,
                    source_external_id=ref,
                    metadata_tags=metadata_tags,
                )
                .on_conflict_do_update(
                    index_elements=["source", "source_external_id"],
                    set_={
                        "name": name,
                        "description": description or None,
                        "poi_type": poi_type,
                        "geom": from_shape(point, srid=4326),
                        "metadata_tags": metadata_tags,
                    },
                )
            )
            s.execute(stmt)
            kept += 1

    return {"kept": kept, "skipped": skipped, "by_type": by_type}
