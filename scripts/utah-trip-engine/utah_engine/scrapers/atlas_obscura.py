"""Pull Atlas Obscura's Utah places via Playwright.

Atlas Obscura sits behind Cloudflare bot detection, so we need a real
browser context (not plain ``requests``). The structured data per place
lives in JSON-LD ``Place`` markup embedded on each page.

Pipeline:
  1. Walk ``/things-to-do/utah/places?page=N`` until no new slugs.
  2. For each slug, navigate to the place page, wait for the JS
     challenge to clear, and pull the JSON-LD block whose ``@type``
     includes ``Place``.
  3. Filter by distance from Moab (so we don't store ~250 entries
     outside the radius); the pilot bbox is ~50 miles.
  4. Upsert into ``utah_poi`` with ``source='atlas_obscura'`` and
     ``is_hidden_gem=True``.

Atlas Obscura is the "weird and wonderful" curation source, so every
entry is automatically flagged as a hidden gem.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator

from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy.dialects.postgresql import insert

from utah_engine.config import settings
from utah_engine.db import session_scope
from utah_engine.models import UtahPOI

INDEX_URL = "https://www.atlasobscura.com/things-to-do/utah/places"
PLACE_BASE = "https://www.atlasobscura.com/places"

CACHE_DIR = Path(__file__).parent.parent.parent / ".cache" / "atlas_obscura"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
)


@dataclass
class AtlasPlace:
    slug: str
    name: str
    description: str
    lat: float
    lng: float
    address_locality: str | None
    image_url: str | None
    raw: dict[str, Any]


def _haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 3958.7613
    to_rad = math.radians
    dlat = to_rad(lat2 - lat1)
    dlng = to_rad(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(to_rad(lat1)) * math.cos(to_rad(lat2)) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _new_browser_context(p: Any) -> Any:
    browser = p.chromium.launch(
        headless=True,
        args=["--disable-blink-features=AutomationControlled"],
    )
    ctx = browser.new_context(
        user_agent=UA,
        viewport={"width": 1280, "height": 1200},
        locale="en-US",
    )
    ctx.add_init_script(
        "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
    )
    return browser, ctx


def _wait_for_real_page(page: Any, max_seconds: int = 20) -> bool:
    """Poll until the page title isn't a Cloudflare challenge. Returns True if cleared."""
    deadline = time.monotonic() + max_seconds
    while time.monotonic() < deadline:
        title = page.title()
        if title and "Cloudflare" not in title and "Just a moment" not in title:
            return True
        time.sleep(1)
    return False


def _cache_path(kind: str, key: str) -> Path:
    h = hashlib.sha256(key.encode()).hexdigest()[:16]
    sub = CACHE_DIR / kind
    sub.mkdir(parents=True, exist_ok=True)
    return sub / f"{h}.html"


def _fetch_page_html(page: Any, url: str, *, kind: str, key: str) -> str | None:
    cache_file = _cache_path(kind, key)
    if cache_file.exists():
        return cache_file.read_text()
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=20000)
    except Exception:
        return None
    if not _wait_for_real_page(page):
        return None
    html = page.content()
    cache_file.write_text(html)
    return html


def iter_utah_slugs(page: Any, max_pages: int = 25) -> Iterator[str]:
    seen: set[str] = set()
    for n in range(1, max_pages + 1):
        url = f"{INDEX_URL}?page={n}"
        html = _fetch_page_html(page, url, kind="index", key=f"utah-page-{n}")
        if not html:
            return
        slugs = sorted(set(re.findall(r"/places/([a-z0-9-]+)", html)))
        new = [s for s in slugs if s not in seen]
        if not new:
            return
        for s in new:
            seen.add(s)
            yield s


def _extract_place(html: str, slug: str) -> AtlasPlace | None:
    blocks = re.findall(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.+?)</script>',
        html,
        flags=re.DOTALL,
    )
    for block in blocks:
        try:
            data = json.loads(block.strip())
        except Exception:
            continue
        if not isinstance(data, dict):
            continue
        types = data.get("@type") or []
        if isinstance(types, str):
            types = [types]
        if "Place" not in types and "TouristAttraction" not in types:
            continue
        geo = data.get("geo") or {}
        try:
            lat = float(geo.get("latitude"))
            lng = float(geo.get("longitude"))
        except Exception:
            return None
        addr = data.get("address") or {}
        image = data.get("image")
        if isinstance(image, list):
            image = image[0] if image else None
        return AtlasPlace(
            slug=slug,
            name=str(data.get("name") or slug),
            description=str(data.get("description") or "").strip(),
            lat=lat,
            lng=lng,
            address_locality=addr.get("addressLocality") if isinstance(addr, dict) else None,
            image_url=image if isinstance(image, str) else None,
            raw=data,
        )
    return None


def ingest_atlas_obscura(
    radius_mi: float | None = None,
    max_index_pages: int = 25,
    inter_request_seconds: float = 1.5,
) -> dict[str, int]:
    """Walk Utah index, fetch each place, keep those within Moab radius."""
    radius = radius_mi or settings.radius_mi

    candidates = 0
    in_radius = 0
    no_geo = 0
    cloudflare_failures = 0

    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser, ctx = _new_browser_context(p)
        page = ctx.new_page()
        slugs = list(iter_utah_slugs(page, max_pages=max_index_pages))
        print(f"[atlas_obscura] index: {len(slugs)} slugs across pages")

        with session_scope() as s:
            for slug in slugs:
                candidates += 1
                url = f"{PLACE_BASE}/{slug}"
                html = _fetch_page_html(page, url, kind="place", key=slug)
                if html is None:
                    cloudflare_failures += 1
                    time.sleep(inter_request_seconds)
                    continue
                place = _extract_place(html, slug)
                if place is None:
                    no_geo += 1
                    time.sleep(inter_request_seconds)
                    continue

                dist = _haversine_miles(
                    settings.moab_lat, settings.moab_lng, place.lat, place.lng
                )
                if dist > radius:
                    time.sleep(inter_request_seconds)
                    continue

                pt = Point(place.lng, place.lat)
                metadata_tags: dict[str, Any] = {
                    "atlas_obscura_slug": slug,
                    "atlas_obscura_jsonld": place.raw,
                    "image_url": place.image_url,
                    "address_locality": place.address_locality,
                    "distance_from_moab_mi": round(dist, 2),
                    "summary": place.description,
                }

                stmt = (
                    insert(UtahPOI)
                    .values(
                        name=place.name,
                        description=place.description,
                        geom=from_shape(pt, srid=4326),
                        poi_type="hidden_gem",
                        source="atlas_obscura",
                        source_url=url,
                        source_external_id=slug,
                        is_hidden_gem=True,
                        metadata_tags=metadata_tags,
                    )
                    .on_conflict_do_update(
                        index_elements=["source", "source_external_id"],
                        set_={
                            "name": place.name,
                            "description": place.description,
                            "geom": from_shape(pt, srid=4326),
                            "metadata_tags": metadata_tags,
                            "is_hidden_gem": True,
                        },
                    )
                )
                s.execute(stmt)
                in_radius += 1
                time.sleep(inter_request_seconds)

        browser.close()

    return {
        "utah_candidates": candidates,
        "moab_radius_kept": in_radius,
        "skipped_no_geo": no_geo,
        "cloudflare_failures": cloudflare_failures,
    }
