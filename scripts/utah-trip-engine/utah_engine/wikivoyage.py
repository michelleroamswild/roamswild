"""Pull geo-tagged listings from Wikivoyage articles for Moab-area towns
and parks.

Wikivoyage articles are wiki-markup with structured ``{{listing}}`` /
``{{see}}`` / ``{{do}}`` templates that include name + lat/long +
description. We hit the MediaWiki API for the raw wikitext, regex-parse
the templates, and upsert each listing as a ``utah_poi`` row.
"""
from __future__ import annotations

import math
import re
from typing import Any, Iterator

import requests
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy.dialects.postgresql import insert
from tenacity import retry, stop_after_attempt, wait_exponential

from utah_engine.config import settings
from utah_engine.db import session_scope
from utah_engine.models import UtahPOI

API_URL = "https://en.wikivoyage.org/w/api.php"

# Wikivoyage articles likely to contain Moab-area listings.
DEFAULT_ARTICLES: tuple[str, ...] = (
    "Moab",
    "Arches National Park",
    "Canyonlands National Park",
    "Bears Ears National Monument",
    "Glen Canyon National Recreation Area",
    "Dead Horse Point State Park",
    "Indian Creek (Utah)",
    "Castle Valley",
    "Green River (Utah)",
    "Monticello (Utah)",
    "Blanding",
    "Bluff (Utah)",
    "La Sal",
)

# Wiki listing template kinds → poi_type. Wikivoyage uses {{see}}, {{do}},
# {{eat}}, {{drink}}, {{sleep}}, {{listing|type=...}}.
_KIND_MAP: dict[str, str] = {
    "see": "scenic_overlook",
    "do": "other_landmark",
    "eat": "commercial",
    "drink": "commercial",
    "sleep": "lodging",
    "buy": "commercial",
}

# {{listing|...}} param → value
_PARAM_RE = re.compile(r"\|\s*([a-z_]+)\s*=\s*([^|}\n]+)")
_TEMPLATE_RE = re.compile(
    r"\{\{(see|do|eat|drink|sleep|buy|listing)\b([^}]*)\}\}",
    re.IGNORECASE | re.DOTALL,
)


def _haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 3958.7613
    to_rad = math.radians
    dlat = to_rad(lat2 - lat1)
    dlng = to_rad(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(to_rad(lat1)) * math.cos(to_rad(lat2)) * math.sin(dlng / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(a))


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def _fetch_wikitext(title: str) -> str | None:
    r = requests.get(
        API_URL,
        params={
            "action": "query",
            "prop": "revisions",
            "rvprop": "content",
            "rvslots": "main",
            "titles": title,
            "format": "json",
            "formatversion": 2,
        },
        headers={"User-Agent": "roamswild-utah-pilot/0.1 (hello@roamswild.app)"},
        timeout=30,
    )
    r.raise_for_status()
    pages = r.json().get("query", {}).get("pages", []) or []
    if not pages or pages[0].get("missing"):
        return None
    revs = pages[0].get("revisions") or []
    if not revs:
        return None
    return revs[0].get("slots", {}).get("main", {}).get("content")


def _parse_listings(wikitext: str, kind_default: str = "see") -> Iterator[dict[str, Any]]:
    for m in _TEMPLATE_RE.finditer(wikitext):
        kind = m.group(1).lower()
        body = "|" + m.group(2)
        params: dict[str, str] = {}
        for pm in _PARAM_RE.finditer(body):
            params[pm.group(1).lower()] = pm.group(2).strip()

        name = params.get("name") or params.get("alt") or ""
        if not name:
            continue
        try:
            lat = float(params["lat"])
            lng = float(params["long"]) if "long" in params else float(params.get("lng", ""))
        except Exception:
            continue
        if math.isnan(lat) or math.isnan(lng):
            continue

        # Wikivoyage uses {{listing|type=see}} sometimes
        actual_kind = (params.get("type") or kind).lower()
        yield {
            "kind": actual_kind,
            "name": name.strip(),
            "lat": lat,
            "lng": lng,
            "description": params.get("content") or params.get("description"),
            "url": params.get("url"),
            "phone": params.get("phone"),
            "address": params.get("address"),
            "raw": params,
        }


def ingest_wikivoyage(
    radius_mi: float | None = None,
    articles: tuple[str, ...] = DEFAULT_ARTICLES,
) -> dict[str, int]:
    radius = radius_mi or settings.radius_mi

    kept = 0
    skipped_no_geo = 0
    skipped_outside = 0
    skipped_invalid_kind = 0
    by_article: dict[str, int] = {}

    with session_scope() as s:
        for article in articles:
            wt = _fetch_wikitext(article)
            if not wt:
                by_article[article] = 0
                continue
            article_kept = 0
            for L in _parse_listings(wt):
                kind = L["kind"]
                # Skip commercial/lodging/eat/drink — not the recommendation
                # engine's vertical right now. (Easy to flip later.)
                if kind in {"eat", "drink", "buy", "sleep"}:
                    skipped_invalid_kind += 1
                    continue
                poi_type = _KIND_MAP.get(kind, "other_landmark")

                if (
                    _haversine_miles(settings.moab_lat, settings.moab_lng, L["lat"], L["lng"])
                    > radius
                ):
                    skipped_outside += 1
                    continue

                external_id = f"wikivoyage:{article}:{L['name']}".replace(" ", "_")[:200]

                metadata_tags: dict[str, Any] = {
                    "wikivoyage_article": article,
                    "wikivoyage_kind": kind,
                    "wikivoyage_attributes": L["raw"],
                    "summary": (L.get("description") or "")[:500],
                }

                stmt = (
                    insert(UtahPOI)
                    .values(
                        name=L["name"][:200],
                        description=(L.get("description") or "")[:1000] or None,
                        geom=from_shape(Point(L["lng"], L["lat"]), srid=4326),
                        poi_type=poi_type,
                        source="wikivoyage",
                        source_url=f"https://en.wikivoyage.org/wiki/{article.replace(' ', '_')}",
                        source_external_id=external_id,
                        metadata_tags=metadata_tags,
                    )
                    .on_conflict_do_update(
                        index_elements=["source", "source_external_id"],
                        set_={
                            "name": L["name"][:200],
                            "description": (L.get("description") or "")[:1000] or None,
                            "poi_type": poi_type,
                            "geom": from_shape(Point(L["lng"], L["lat"]), srid=4326),
                            "metadata_tags": metadata_tags,
                        },
                    )
                )
                s.execute(stmt)
                kept += 1
                article_kept += 1
            by_article[article] = article_kept

    return {
        "kept": kept,
        "skipped_no_geo": skipped_no_geo,
        "skipped_outside_radius": skipped_outside,
        "skipped_lodging_or_food": skipped_invalid_kind,
        "by_article": by_article,
    }
