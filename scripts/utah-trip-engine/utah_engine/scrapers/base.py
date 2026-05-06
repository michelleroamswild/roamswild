"""Base scraper plumbing — throttling, retries, and a `persist_snippets`
helper that all concrete scrapers can use to upsert their output into the
`snippets` table.
"""
from __future__ import annotations

import abc
import time
from collections.abc import Iterable, Iterator

from sqlalchemy.dialects.postgresql import insert as pg_insert

from utah_engine.db import session_scope
from utah_engine.models import ScrapedSnippet, Snippet


class AbstractScraper(abc.ABC):
    """Subclass for each community source. Yields :class:`ScrapedSnippet`."""

    source: str = ""           # e.g. "reddit:r/Moab", "atlas_obscura"
    min_interval_s: float = 1.0  # default polite throttle

    def __init__(self) -> None:
        self._last_call: float = 0.0

    # ------------------------------------------------------------------
    # API for callers
    # ------------------------------------------------------------------

    @abc.abstractmethod
    def run(self) -> Iterator[ScrapedSnippet]:
        """Yield scraped snippets. Implemented per source."""

    # ------------------------------------------------------------------
    # Helpers for subclasses
    # ------------------------------------------------------------------

    def _throttle(self) -> None:
        """Sleep just enough so successive requests respect ``min_interval_s``."""
        gap = time.monotonic() - self._last_call
        wait = self.min_interval_s - gap
        if wait > 0:
            time.sleep(wait)
        self._last_call = time.monotonic()


def persist_snippets(snippets: Iterable[ScrapedSnippet]) -> tuple[int, int]:
    """Upsert scraper output into the `snippets` table. Returns (new, updated)."""
    new_count = 0
    updated_count = 0

    with session_scope() as s:
        for snip in snippets:
            stmt = (
                pg_insert(Snippet)
                .values(
                    source=snip.source,
                    source_url=snip.source_url,
                    source_external_id=_external_id(snip),
                    name=snip.name,
                    raw_text=snip.raw_text,
                    lat=snip.lat,
                    lng=snip.lng,
                    enrichment={"scraper_extra": snip.extra},
                )
                .on_conflict_do_update(
                    index_elements=["source", "source_external_id"],
                    set_={
                        "name": snip.name,
                        "raw_text": snip.raw_text,
                        "lat": snip.lat,
                        "lng": snip.lng,
                    },
                )
                .returning(Snippet.id, Snippet.created_at, Snippet.updated_at)
            )
            row = s.execute(stmt).first()
            if row is None:
                continue
            # First write has created_at == updated_at (within microseconds).
            if row.created_at == row.updated_at:
                new_count += 1
            else:
                updated_count += 1

    return new_count, updated_count


def _external_id(snip: ScrapedSnippet) -> str:
    """Unique-per-source identifier. Caller can override by setting
    snip.extra['external_id']; default is hash(url + name).
    """
    if (eid := snip.extra.get("external_id")) and isinstance(eid, str):
        return eid
    import hashlib

    payload = f"{snip.source_url}|{snip.name or ''}".encode()
    return hashlib.sha256(payload).hexdigest()[:16]
