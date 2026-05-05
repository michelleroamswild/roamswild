"""Ingest curated POI seed lists from a local JSON file.

Used to bypass scrapers blocked by aggressive Cloudflare rules (Atlas
Obscura) — you hand-curate name + lat/lng + description in
``data/atlas_obscura_seed.json`` and this loader upserts them as
``utah_poi`` rows tagged ``is_hidden_gem=True``.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy.dialects.postgresql import insert

from utah_engine.config import settings
from utah_engine.db import session_scope
from utah_engine.models import UtahPOI


def _haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 3958.7613
    to_rad = math.radians
    dlat = to_rad(lat2 - lat1)
    dlng = to_rad(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(to_rad(lat1)) * math.cos(to_rad(lat2)) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def ingest_seed_file(
    path: Path,
    *,
    source: str = "atlas_obscura",
    poi_type: str = "hidden_gem",
    is_hidden_gem: bool = True,
    enforce_radius: bool = True,
) -> dict[str, int]:
    raw = path.read_text()
    items: list[dict[str, Any]] = json.loads(raw)

    kept = 0
    skipped_outside = 0
    skipped_invalid = 0

    with session_scope() as s:
        for it in items:
            try:
                lat = float(it["lat"])
                lng = float(it["lng"])
                name = str(it["name"]).strip()
                slug = str(it.get("slug") or it.get("source_external_id") or name).strip()
            except Exception:
                skipped_invalid += 1
                continue
            if not name or not slug:
                skipped_invalid += 1
                continue
            if enforce_radius:
                if _haversine_miles(settings.moab_lat, settings.moab_lng, lat, lng) > settings.radius_mi:
                    skipped_outside += 1
                    continue

            metadata_tags: dict[str, Any] = {
                "summary": it.get("description"),
                "atlas_obscura_url": it.get("atlas_obscura_url"),
                "tags": it.get("tags") or [],
                "verified": bool(it.get("_verified")),
                "curation_notes": it.get("_notes"),
            }

            stmt = (
                insert(UtahPOI)
                .values(
                    name=name,
                    description=it.get("description"),
                    geom=from_shape(Point(lng, lat), srid=4326),
                    poi_type=poi_type,
                    source=source,
                    source_url=it.get("atlas_obscura_url"),
                    source_external_id=slug,
                    is_hidden_gem=is_hidden_gem,
                    metadata_tags=metadata_tags,
                )
                .on_conflict_do_update(
                    index_elements=["source", "source_external_id"],
                    set_={
                        "name": name,
                        "description": it.get("description"),
                        "geom": from_shape(Point(lng, lat), srid=4326),
                        "is_hidden_gem": is_hidden_gem,
                        "metadata_tags": metadata_tags,
                    },
                )
            )
            s.execute(stmt)
            kept += 1

    return {
        "input_count": len(items),
        "kept": kept,
        "skipped_outside_radius": skipped_outside,
        "skipped_invalid": skipped_invalid,
    }
