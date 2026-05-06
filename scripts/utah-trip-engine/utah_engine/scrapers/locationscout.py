"""LocationScout endorsement layer.

Walks the public Utah index pages on locationscout.net (Cloudflare-cleared
via Playwright), harvests slug-encoded spot names, then fuzzy-matches them
against existing ``utah_poi`` rows from GNIS / OSM. Matched POIs get
``is_hidden_gem=true`` and a ``metadata_tags.locationscout`` block linking
to the source page.

The detail pages (and the pulse.locationscout.net data feed) sit behind a
content-security-policy that prevents us from fetching coordinates, so we
treat locationscout as a curation/endorsement layer on top of our
authoritative geo skeleton — not a new POI source.
"""
from __future__ import annotations

import hashlib
import re
import time
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from rapidfuzz import fuzz, process
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from utah_engine.db import session_scope
from utah_engine.models import Snippet, UtahPOI

INDEX_URL = "https://www.locationscout.net/locations/1058-utah/spots"
SPOT_BASE = "https://www.locationscout.net/usa"

CACHE_DIR = Path(__file__).parent.parent.parent / ".cache" / "locationscout"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
)

DEFAULT_NAME_THRESHOLD = 78


@dataclass(frozen=True)
class SpotListing:
    spot_id: int
    slug: str
    name: str  # derived from slug

    @property
    def primary_url(self) -> str:
        return f"{SPOT_BASE}/{self.spot_id}-{self.slug}"


def _slug_to_name(slug: str) -> str:
    return slug.replace("-", " ").strip()


def _strip_region_suffix(name: str) -> str:
    """Locationscout slugs often include the park/region as a trailing
    qualifier (``mesa-arch-canyonlands-national-park``). For matching against
    POI names we want just the leading place name.
    """
    suffixes = (
        " arches national park",
        " canyonlands national park",
        " bryce canyon national park",
        " zion national park",
        " capitol reef national park",
        " grand staircase escalante national monument",
        " bears ears national monument",
        " grand canyon national park",
        " glen canyon national recreation area",
    )
    low = name.lower()
    for suf in suffixes:
        if low.endswith(suf):
            return name[: len(name) - len(suf)].strip()
    return name


def _cache_page(n: int) -> Path:
    return CACHE_DIR / f"index-page-{n}.html"


def _new_browser_context(p: Any) -> tuple[Any, Any]:
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


def _wait_for_real_page(page: Any, max_seconds: int = 15) -> bool:
    deadline = time.monotonic() + max_seconds
    while time.monotonic() < deadline:
        title = page.title()
        if title and "Just a moment" not in title and "Cloudflare" not in title:
            return True
        time.sleep(1)
    return False


def _fetch_index_page(page: Any, n: int) -> str | None:
    cache_file = _cache_page(n)
    if cache_file.exists():
        return cache_file.read_text()
    url = INDEX_URL if n == 1 else f"{INDEX_URL}/{n}"
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
    except Exception:
        return None
    if not _wait_for_real_page(page):
        return None
    html = page.content()
    cache_file.write_text(html)
    return html


def harvest_listings(max_pages: int = 50, throttle_s: float = 1.5) -> list[SpotListing]:
    """Walk the Utah index pages and return unique spot listings."""
    from playwright.sync_api import sync_playwright

    seen: dict[int, SpotListing] = {}
    with sync_playwright() as p:
        browser, ctx = _new_browser_context(p)
        page = ctx.new_page()
        for n in range(1, max_pages + 1):
            html = _fetch_index_page(page, n)
            if not html:
                break
            new_count = 0
            for m in re.finditer(r"/usa/(\d+)-([a-z0-9-]+)/\d+", html):
                spot_id = int(m.group(1))
                slug = m.group(2).strip("-")
                if spot_id in seen:
                    continue
                seen[spot_id] = SpotListing(
                    spot_id=spot_id,
                    slug=slug,
                    name=_slug_to_name(slug),
                )
                new_count += 1
            if new_count == 0:
                break
            time.sleep(throttle_s)
        browser.close()
    return list(seen.values())


def _match_against_pois(
    listings: list[SpotListing], threshold: int
) -> dict[str, Any]:
    """For each listing, find the best POI by fuzzy name match.

    Returns: {matched: [(listing, poi_id, score)], unmatched: [listing]}.
    """
    with session_scope() as s:
        rows = s.execute(
            select(UtahPOI.id, UtahPOI.name, UtahPOI.poi_type).where(
                UtahPOI.source.in_(("gnis", "osm"))
            )
        ).all()

    if not rows:
        return {"matched": [], "unmatched": list(listings)}

    # Build a name -> [poi_id, ...] index for cheap candidate retrieval.
    poi_index = [(str(r[0]), r[1] or "", r[2] or "") for r in rows]
    poi_names = [n for _id, n, _t in poi_index]

    matched: list[tuple[SpotListing, str, int, str]] = []  # listing, poi_id, score, matched_name
    unmatched: list[SpotListing] = []

    for listing in listings:
        candidate_name = _strip_region_suffix(listing.name)
        # Fast top-1 match via rapidfuzz process.extractOne
        result = process.extractOne(
            candidate_name,
            poi_names,
            scorer=fuzz.token_set_ratio,
            score_cutoff=threshold,
        )
        if result is None:
            unmatched.append(listing)
            continue
        match_name, score, idx = result
        poi_id = poi_index[idx][0]
        matched.append((listing, poi_id, int(score), match_name))

    return {"matched": matched, "unmatched": unmatched}


def apply_endorsements(
    listings: list[SpotListing], threshold: int = DEFAULT_NAME_THRESHOLD
) -> dict[str, Any]:
    result = _match_against_pois(listings, threshold)
    matched = result["matched"]
    unmatched = result["unmatched"]

    # Tally how many matches each POI ended up with (some POIs match
    # multiple listing slugs; e.g., "Mesa Arch" appears in several photo
    # variants on locationscout). Highest-score listing wins per POI.
    best_per_poi: dict[str, tuple[SpotListing, int, str]] = {}
    for listing, poi_id, score, match_name in matched:
        cur = best_per_poi.get(poi_id)
        if cur is None or score > cur[1]:
            best_per_poi[poi_id] = (listing, score, match_name)

    with session_scope() as s:
        for poi_id, (listing, score, match_name) in best_per_poi.items():
            payload = {
                "spot_id": listing.spot_id,
                "slug": listing.slug,
                "url": listing.primary_url,
                "match_score": score,
                "matched_name": match_name,
                "listing_name": listing.name,
            }
            s.execute(
                text(
                    """
                    UPDATE utah_poi
                    SET is_hidden_gem = true,
                        metadata_tags = COALESCE(metadata_tags, '{}'::jsonb)
                          || jsonb_build_object('locationscout', CAST(:p AS jsonb))
                    WHERE id = CAST(:id AS uuid)
                    """
                ),
                {"id": poi_id, "p": _json(payload)},
            )

    # Save unmatched names for hand-curation fodder (text file dump).
    out_path = CACHE_DIR / "unmatched_listings.txt"
    out_path.write_text(
        "\n".join(f"{u.spot_id}\t{u.name}\t{u.primary_url}" for u in sorted(unmatched, key=lambda x: x.name))
    )

    # Land unmatched listings in `snippets` so they're queryable / promotable
    # later. They have a name + source URL but no coords yet — perfect for the
    # snippets table (which has nullable lat/lng).
    snippets_inserted = 0
    snippets_updated = 0
    if unmatched:
        with session_scope() as s:
            for u in unmatched:
                synthetic_text = (
                    f"{u.name} — photographic location listed on locationscout.net. "
                    "Photogenic outdoor spot identified by photographers. "
                    f"Source: {u.primary_url}"
                )
                payload = {
                    "locationscout_unmatched": True,
                    "spot_id": u.spot_id,
                    "slug": u.slug,
                    "listing_name": u.name,
                }
                stmt = (
                    pg_insert(Snippet)
                    .values(
                        source="locationscout",
                        source_url=u.primary_url,
                        source_external_id=f"locationscout-{u.spot_id}",
                        name=u.name,
                        raw_text=synthetic_text,
                        enrichment=payload,
                    )
                    .on_conflict_do_update(
                        index_elements=["source", "source_external_id"],
                        set_={
                            "name": u.name,
                            "raw_text": synthetic_text,
                            "enrichment": payload,
                        },
                    )
                    .returning(Snippet.id, Snippet.created_at, Snippet.updated_at)
                )
                row = s.execute(stmt).first()
                if row is None:
                    continue
                if row.created_at == row.updated_at:
                    snippets_inserted += 1
                else:
                    snippets_updated += 1

    counter = Counter(t[2] for t in matched)  # by score
    return {
        "listings_total": len(listings),
        "matched_listings": len(matched),
        "unique_pois_endorsed": len(best_per_poi),
        "unmatched": len(unmatched),
        "unmatched_snippets_new": snippets_inserted,
        "unmatched_snippets_updated": snippets_updated,
        "score_buckets": {
            "100": counter.get(100, 0),
            "90-99": sum(v for k, v in counter.items() if 90 <= k < 100),
            "80-89": sum(v for k, v in counter.items() if 80 <= k < 90),
            "78-79": sum(v for k, v in counter.items() if 78 <= k < 80),
        },
        "unmatched_dump": str(out_path),
    }


def _json(payload: Any) -> str:
    import json
    return json.dumps(payload, default=str)
