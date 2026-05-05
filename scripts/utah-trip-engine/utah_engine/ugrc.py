"""Pull UGRC TrailsAndPathways features intersecting the Moab radius.

The ArcGIS Feature Service is paginated and returns GeoJSON. For each
feature we compute the centroid (LineString -> Point) for the indexed POI
geometry, and stash the full GeoJSON LineString in metadata_tags so the
trip engine can later draw the actual route.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Iterator

import requests
from geoalchemy2.shape import from_shape
from shapely.geometry import LineString, MultiLineString, Point, shape
from sqlalchemy.dialects.postgresql import insert
from tenacity import retry, stop_after_attempt, wait_exponential

from utah_engine.config import settings
from utah_engine.db import session_scope
from utah_engine.models import UtahPOI

UGRC_URL = (
    "https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/"
    "TrailsAndPathways/FeatureServer/0/query"
)

# UGRC's TrailsAndPathways layer doesn't expose a single PrimaryUse string.
# It carries DesignatedUses ("Multiuse" / "Pedestrian" / None) plus boolean
# fields (MotorizedAllowed, HorseAllowed) and difficulty grades
# (HikeDifficulty, BikeDifficulty). We normalize to the pilot vocab below.
_DESIGNATED_USE_MAP = {
    "multiuse": "Multi-use",
    "pedestrian": "Hiking",
    "hiking": "Hiking",
    "bicycle": "Mountain Bike",
    "bicycling": "Mountain Bike",
    "motorized": "Motorized",
    "equestrian": "Equestrian",
    "ohv": "OHV",
}


def _derive_primary_use(props: dict[str, Any]) -> str | None:
    raw = props.get("DesignatedUses")
    if raw and (mapped := _DESIGNATED_USE_MAP.get(raw.strip().lower())):
        return mapped
    if (props.get("MotorizedAllowed") or "").lower() == "yes":
        return "Motorized"
    if (props.get("HorseAllowed") or "").lower() == "yes":
        return "Equestrian"
    if (props.get("BikeDifficulty") or "").strip():
        return "Mountain Bike"
    if (props.get("HikeDifficulty") or "").strip() or props.get("ADAAccessible"):
        return "Hiking"
    if (props.get("Class") or "").lower() in {"trail", "path"}:
        # Use unknown — accept the row, leave use unspecified
        return None
    return None


@dataclass
class UGRCBbox:
    xmin: float
    ymin: float
    xmax: float
    ymax: float

    def as_param(self) -> str:
        return f"{self.xmin},{self.ymin},{self.xmax},{self.ymax}"


def bbox_from_radius(lat: float, lng: float, radius_mi: float) -> UGRCBbox:
    """Conservative bbox (over-covers a circle) around the anchor."""
    deg_lat = radius_mi / 69.0
    deg_lng = radius_mi / (69.0 * max(math.cos(math.radians(lat)), 1e-6))
    return UGRCBbox(xmin=lng - deg_lng, ymin=lat - deg_lat, xmax=lng + deg_lng, ymax=lat + deg_lat)


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def _fetch_page(bbox: UGRCBbox, offset: int, page_size: int) -> dict[str, Any]:
    params = {
        "where": "1=1",
        "geometry": bbox.as_param(),
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
    r = requests.get(UGRC_URL, params=params, timeout=60)
    r.raise_for_status()
    return r.json()


def iter_features(bbox: UGRCBbox, page_size: int = 1000) -> Iterator[dict[str, Any]]:
    offset = 0
    while True:
        page = _fetch_page(bbox, offset, page_size)
        feats = page.get("features", []) or []
        if not feats:
            return
        for feat in feats:
            yield feat
        if len(feats) < page_size and not page.get("properties", {}).get("exceededTransferLimit"):
            return
        offset += page_size


def _centroid(geom_json: dict[str, Any]) -> Point | None:
    """LineString / MultiLineString -> centroid Point. None if unsupported."""
    try:
        shp = shape(geom_json)
    except Exception:
        return None
    if isinstance(shp, (LineString, MultiLineString)):
        return shp.centroid
    if isinstance(shp, Point):
        return shp
    if hasattr(shp, "centroid"):
        return shp.centroid
    return None


def ingest_ugrc(
    radius_mi: float | None = None,
    limit: int = 0,
) -> tuple[int, int]:
    """Fetch + upsert UGRC trails into utah_poi. Returns (kept, skipped)."""
    radius = radius_mi or settings.radius_mi
    bbox = bbox_from_radius(settings.moab_lat, settings.moab_lng, radius)

    kept = 0
    skipped = 0
    seen_external_ids: set[str] = set()

    with session_scope() as s:
        for feat in iter_features(bbox):
            props: dict[str, Any] = feat.get("properties") or {}
            geom_json: dict[str, Any] | None = feat.get("geometry")
            if not geom_json:
                skipped += 1
                continue

            # Identify the trail. Unique_ID is more stable across reloads than
            # OBJECTID (which can churn when the publisher rebuilds the layer).
            external_id = str(
                props.get("Unique_ID") or props.get("ID") or props.get("OBJECTID") or ""
            ).strip()
            if not external_id:
                skipped += 1
                continue
            if external_id in seen_external_ids:
                continue
            seen_external_ids.add(external_id)

            # Drop UNOFFICIAL trails — often duplicates / unverified spurs.
            # Keep EXISTING + UNCERTAIN; tag UNCERTAIN in metadata.
            status = (props.get("Status") or "").upper()
            if status == "UNOFFICIAL":
                skipped += 1
                continue

            use = _derive_primary_use(props)

            centroid = _centroid(geom_json)
            if centroid is None:
                skipped += 1
                continue

            name = (
                props.get("PrimaryName")
                or props.get("SystemName")
                or props.get("RecreationArea")
                or "Unnamed trail"
            )

            metadata_tags: dict[str, Any] = {
                "ugrc_attributes": props,
                "line_geojson": geom_json,
                "ugrc_status": status or None,
                "ugrc_difficulty_hike": props.get("HikeDifficulty"),
                "ugrc_difficulty_bike": props.get("BikeDifficulty"),
                "ugrc_surface": props.get("SurfaceType"),
            }

            stmt = (
                insert(UtahPOI)
                .values(
                    name=name,
                    description=(props.get("Comments") or props.get("Description")),
                    geom=from_shape(centroid, srid=4326),
                    poi_type="trail",
                    primary_use=use,
                    source="ugrc",
                    source_url="https://gis.utah.gov/products/sgid/recreation/trails-and-pathways/",
                    source_external_id=external_id,
                    metadata_tags=metadata_tags,
                )
                .on_conflict_do_update(
                    index_elements=["source", "source_external_id"],
                    set_={
                        "name": name,
                        "primary_use": use,
                        "geom": from_shape(centroid, srid=4326),
                        "metadata_tags": metadata_tags,
                    },
                )
            )
            s.execute(stmt)
            kept += 1

            if limit and kept >= limit:
                break

    return kept, skipped
