"""Pull historical mining records (and ghost-town markers) from the USGS
Mineral Resources Data System (MRDS) WFS endpoint.

We use the ``ms:mrds-low`` typename — the broader, more lenient layer
covering deposits/sites at all confidence levels. Each row has
geographic coordinates, deposit name, commodity (Cu, Au, U, etc.),
operation type, and development status.
"""
from __future__ import annotations

import re
from typing import Any

import requests
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy.dialects.postgresql import insert
from tenacity import retry, stop_after_attempt, wait_exponential

from utah_engine.config import settings
from utah_engine.db import session_scope
from utah_engine.models import UtahPOI
from utah_engine.ugrc import bbox_from_radius

WFS_URL = "https://mrdata.usgs.gov/services/mrds"
TYPENAME = "ms:mrds-low"


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def _fetch_gml(bbox_param: str, count: int = 5000) -> bytes:
    """WFS 1.1 GetFeature with a bbox filter. Returns GML XML bytes.

    MRDS only exposes GML (no JSON output format), so we parse the XML.
    """
    params = {
        "service": "WFS",
        "version": "1.1.0",
        "request": "GetFeature",
        "typeName": TYPENAME,
        "BBOX": bbox_param,
        "outputFormat": "text/xml; subtype=gml/3.1.1",
        "maxFeatures": count,
        "srsName": "EPSG:4326",
    }
    r = requests.get(WFS_URL, params=params, timeout=120)
    r.raise_for_status()
    return r.content


def _parse_gml(xml_bytes: bytes) -> list[dict[str, Any]]:
    """Pull (props, lat, lng) from each ms:mrds-low feature in a GML 3.1.1 doc."""
    from lxml import etree

    ns = {
        "wfs": "http://www.opengis.net/wfs",
        "gml": "http://www.opengis.net/gml",
        "ms": "http://mapserver.gis.umn.edu/mapserver",
    }
    root = etree.fromstring(xml_bytes)
    out: list[dict[str, Any]] = []
    for member in root.findall(".//gml:featureMember", ns):
        feat = member.find("ms:mrds-low", ns)
        if feat is None:
            continue
        props: dict[str, Any] = {}
        lat = lng = None
        for child in feat:
            tag = etree.QName(child.tag).localname
            if tag == "geometry":
                # Inside is gml:Point > gml:pos. MRDS emits lat,lng despite
                # using lng,lat in BBOX (server quirk).
                pos_el = child.find(".//gml:pos", ns)
                if pos_el is not None and pos_el.text:
                    parts = pos_el.text.strip().split()
                    if len(parts) >= 2:
                        try:
                            lat = float(parts[0])
                            lng = float(parts[1])
                        except ValueError:
                            pass
            elif tag == "boundedBy":
                continue
            else:
                props[tag] = (child.text or "").strip() if child.text else None
        if lat is not None and lng is not None:
            out.append({"properties": props, "lat": lat, "lng": lng})
    return out


def _classify(props: dict[str, Any]) -> str:
    """Map MRDS attributes → poi_type. Most we promote to ``ghost_town`` or
    ``mine_site`` depending on operation type and development status."""
    blob = " ".join(
        str(v or "")
        for v in (
            props.get("dev_stat"),
            props.get("dev_st"),
            props.get("op_type"),
            props.get("site_name"),
            props.get("dep_name"),
        )
    ).lower()
    if any(k in blob for k in ("ghost", "abandoned town", "townsite")):
        return "ghost_town"
    if "underground" in blob or "shaft" in blob:
        return "mine_site"
    if "open pit" in blob or "quarry" in blob:
        return "mine_site"
    return "mine_site"


def ingest_mrds(radius_mi: float | None = None) -> dict[str, int]:
    radius = radius_mi or settings.radius_mi
    bbox = bbox_from_radius(settings.moab_lat, settings.moab_lng, radius)

    # MRDS's WFS uses legacy lng,lat axis order (despite the WFS 1.1 spec
    # calling for lat,lng with EPSG:4326). Verified empirically.
    bbox_param = f"{bbox.xmin},{bbox.ymin},{bbox.xmax},{bbox.ymax}"

    xml_bytes = _fetch_gml(bbox_param)
    feats = _parse_gml(xml_bytes)

    kept = 0
    skipped = 0
    seen: set[str] = set()

    with session_scope() as s:
        for feat in feats:
            props = feat.get("properties") or {}
            try:
                lat = float(feat["lat"])
                lng = float(feat["lng"])
            except Exception:
                skipped += 1
                continue

            # MRDS row id — GML uses 'dep_id' or 'mrds_id'.
            external_id = str(
                props.get("dep_id")
                or props.get("mrds_id")
                or props.get("OBJECTID")
                or ""
            ).strip()
            if not external_id:
                skipped += 1
                continue
            if external_id in seen:
                continue
            seen.add(external_id)

            name = (
                props.get("site_name")
                or props.get("dep_name")
                or props.get("name")
                or ""
            ).strip()
            if not name:
                skipped += 1
                continue
            # Clean up trailing "(prospect)", "(occurrence)" markers since we
            # already encode that in poi_type.
            name = re.sub(r"\s*\([^)]+\)\s*$", "", name).strip()

            poi_type = _classify(props)
            commodity = props.get("commod1") or props.get("commod_main")
            description_parts: list[str] = []
            if props.get("op_type"):
                description_parts.append(str(props.get("op_type")))
            dev = props.get("dev_stat") or props.get("dev_st")
            if dev:
                description_parts.append(str(dev))
            if commodity:
                description_parts.append(f"primary commodity: {commodity}")
            description = " · ".join(description_parts) or None

            metadata_tags: dict[str, Any] = {
                "mrds_attributes": props,
                "mrds_commodity": commodity,
                "mrds_operation_type": props.get("op_type"),
                "mrds_dev_status": props.get("dev_st"),
                "summary": description,
            }

            stmt = (
                insert(UtahPOI)
                .values(
                    name=name,
                    description=description,
                    geom=from_shape(Point(lng, lat), srid=4326),
                    poi_type=poi_type,
                    source="mrds",
                    source_url=f"https://mrdata.usgs.gov/mrds/show-mrds.php?dep_id={external_id}",
                    source_external_id=external_id,
                    metadata_tags=metadata_tags,
                )
                .on_conflict_do_update(
                    index_elements=["source", "source_external_id"],
                    set_={
                        "name": name,
                        "description": description,
                        "poi_type": poi_type,
                        "geom": from_shape(Point(lng, lat), srid=4326),
                        "metadata_tags": metadata_tags,
                    },
                )
            )
            s.execute(stmt)
            kept += 1

    return {"kept": kept, "skipped": skipped, "fetched_features": len(feats)}
