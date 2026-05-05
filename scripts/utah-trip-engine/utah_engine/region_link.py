"""Spatial join populating the poi_region many-to-many.

Run after every ingest stage that adds POIs. Idempotent — uses ON CONFLICT
DO NOTHING via the PK so repeated runs add only new pairings.
"""
from __future__ import annotations

from sqlalchemy import text

from utah_engine.db import session_scope


def link_pois_to_regions() -> int:
    """Insert poi×region pairs for any POI whose geometry falls inside a
    region's bounds. Returns the row count newly inserted.
    """
    with session_scope() as s:
        result = s.execute(
            text(
                """
                INSERT INTO poi_region (poi_id, region_id)
                SELECT poi.id, r.id
                FROM utah_poi poi
                JOIN pilot_regions r
                  ON ST_Contains(r.bounds, poi.geom)
                ON CONFLICT (poi_id, region_id) DO NOTHING
                """
            )
        )
        return result.rowcount or 0
