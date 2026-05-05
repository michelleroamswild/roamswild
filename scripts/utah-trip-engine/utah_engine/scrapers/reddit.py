"""Pull Reddit posts that mention Moab-area place names.

Uses Reddit's public JSON endpoints (no auth, no praw). Filters posts to
those whose title+selftext include at least one Moab gazetteer term —
either a UGRC trail name already in our DB, a region name, or one of the
hand-curated landmarks below. Forms a `ScrapedSnippet` per matching post.
"""
from __future__ import annotations

import re
from collections.abc import Iterator
from typing import Any

import requests
from sqlalchemy import select
from tenacity import retry, stop_after_attempt, wait_exponential

from utah_engine.config import settings
from utah_engine.db import session_scope
from utah_engine.models import PilotRegion, ScrapedSnippet, UtahPOI
from utah_engine.scrapers.base import AbstractScraper

DEFAULT_SUBS: tuple[str, ...] = (
    "Moab",
    "overlanding",
    "Utah",
    "CampingandHiking",
    "hiking",
)

# Hand-curated landmarks the user might mention even if they're not in
# UGRC's TrailsAndPathways. Lowercased for case-insensitive matching.
_HAND_GAZETTEER: frozenset[str] = frozenset(
    {
        "moab",
        "arches",
        "canyonlands",
        "dead horse",
        "la sal",
        "la sals",
        "sand flats",
        "indian creek",
        "bears ears",
        "castle valley",
        "fisher towers",
        "onion creek",
        "mill creek",
        "white rim",
        "the maze",
        "the needles",
        "island in the sky",
        "slickrock",
        "hells revenge",
        "fins and things",
        "poison spider",
        "steel bender",
        "top of the world",
        "gemini bridges",
        "klondike bluffs",
        "negro bill",
        "grandstaff",
        "corona arch",
        "delicate arch",
        "landscape arch",
        "mesa arch",
        "false kiva",
        "professor valley",
        "potash road",
        "shafer trail",
        "cathedral valley",
        "san rafael swell",
        "goblin valley",
        "newspaper rock",
    }
)


class RedditScraper(AbstractScraper):
    source: str = "reddit"
    min_interval_s: float = 1.5  # polite to reddit's public endpoints

    def __init__(self, subs: tuple[str, ...] | None = None, limit_per_sub: int = 100) -> None:
        super().__init__()
        self.subs = subs or DEFAULT_SUBS
        self.limit_per_sub = limit_per_sub
        self._gazetteer_re: re.Pattern[str] | None = None

    # ------------------------------------------------------------------
    # AbstractScraper
    # ------------------------------------------------------------------

    def run(self) -> Iterator[ScrapedSnippet]:
        gazetteer = self._load_gazetteer()
        self._gazetteer_re = re.compile(
            r"\b(" + "|".join(re.escape(t) for t in sorted(gazetteer, key=len, reverse=True)) + r")\b",
            re.IGNORECASE,
        )

        for sub in self.subs:
            for listing in ("top", "hot"):
                yield from self._iter_listing(sub, listing)

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _load_gazetteer(self) -> set[str]:
        terms: set[str] = set(_HAND_GAZETTEER)

        with session_scope() as s:
            for (name,) in s.execute(select(UtahPOI.name)).all():
                if name and isinstance(name, str):
                    n = name.strip().lower()
                    # skip ultra-short names that would pollute the match
                    if len(n) >= 5:
                        terms.add(n)
            for (name,) in s.execute(select(PilotRegion.name)).all():
                if name and isinstance(name, str):
                    terms.add(name.strip().lower())
        return terms

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    def _fetch_page(self, sub: str, listing: str, after: str | None) -> dict[str, Any]:
        self._throttle()
        params: dict[str, Any] = {"limit": min(100, self.limit_per_sub)}
        if listing == "top":
            params["t"] = "year"
        if after:
            params["after"] = after

        url = f"https://www.reddit.com/r/{sub}/{listing}.json"
        r = requests.get(
            url,
            params=params,
            headers={"User-Agent": settings.reddit_user_agent},
            timeout=30,
        )
        r.raise_for_status()
        return r.json()

    def _iter_listing(self, sub: str, listing: str) -> Iterator[ScrapedSnippet]:
        seen = 0
        after: str | None = None
        while seen < self.limit_per_sub:
            page = self._fetch_page(sub, listing, after)
            children = page.get("data", {}).get("children", []) or []
            if not children:
                return
            for child in children:
                post = child.get("data", {}) or {}
                snippet = self._post_to_snippet(sub, listing, post)
                if snippet is not None:
                    yield snippet
                seen += 1
                if seen >= self.limit_per_sub:
                    break
            after = page.get("data", {}).get("after")
            if not after:
                return

    def _post_to_snippet(
        self, sub: str, listing: str, post: dict[str, Any]
    ) -> ScrapedSnippet | None:
        title = (post.get("title") or "").strip()
        body = (post.get("selftext") or "").strip()
        if not title:
            return None

        text = f"{title}\n\n{body}".strip()
        # Filter: must mention at least one Moab-area gazetteer term.
        if self._gazetteer_re is None or not self._gazetteer_re.search(text):
            return None

        permalink = post.get("permalink") or ""
        post_id = post.get("id") or ""
        return ScrapedSnippet(
            name=title,
            raw_text=text,
            source=f"reddit:r/{sub}",
            source_url=f"https://www.reddit.com{permalink}",
            extra={
                "external_id": f"reddit:{post_id}",
                "subreddit": sub,
                "listing": listing,
                "score": post.get("score"),
                "num_comments": post.get("num_comments"),
                "created_utc": post.get("created_utc"),
                "author": post.get("author"),
            },
        )
