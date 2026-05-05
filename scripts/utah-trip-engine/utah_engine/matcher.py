"""Link enriched snippets to authoritative UGRC trail rows.

For each enriched snippet that hasn't been matched yet, the matcher tries
each LLM-extracted `mentioned_places` name against the UGRC trail names
within a spatial pre-filter (radius around the snippet coords if known,
else the full Moab dataset). It uses rapidfuzz token_set_ratio for the
fuzzy comparison.

Outcomes per snippet:
  - one strong match → set ``matched_poi_id`` and merge the enrichment
    into the matched UGRC row's ``metadata_tags.community_signals.{source}``
  - multiple candidates → record them in ``enrichment.match_ambiguous``,
    leave ``matched_poi_id`` null for human review
  - none → leave for the classifier stage
"""
from __future__ import annotations

import re
from typing import Any

from rapidfuzz import fuzz
from sqlalchemy import select, text, update

from utah_engine.config import settings
from utah_engine.db import session_scope
from utah_engine.models import Snippet, UtahPOI

DEFAULT_THRESHOLD = 88
DEFAULT_RADIUS_KM = 5.0

# Tokens too generic to anchor a match on their own. A pair only counts if
# the mention and the candidate share at least one *distinctive* token —
# i.e., not in this set, not a digit, longer than 2 chars.
_STOPWORD_TOKENS = frozenset(
    {
        "the", "a", "an", "of", "and", "or",
        "trail", "trails", "trailhead", "road", "roads", "loop", "route",
        "drive", "trip", "hike", "path", "way", "spur", "connector",
        "campsite", "campground", "camp", "site",
        "moab", "utah", "national", "park", "monument", "forest",
        "north", "south", "east", "west", "upper", "lower", "main",
        "alternate", "old", "new",
    }
)


def _distinctive_tokens(name: str) -> set[str]:
    """Lowercase tokens with stopwords/short tokens/digits removed."""
    out = set()
    for tok in re.findall(r"[a-z]+", name.lower()):
        if len(tok) > 2 and tok not in _STOPWORD_TOKENS:
            out.add(tok)
    return out


def _candidate_pois(s, snippet_lat: float | None, snippet_lng: float | None, radius_km: float) -> list[tuple[str, str, float, float]]:
    """Return [(id, name, lat, lng)] of UGRC POIs eligible for matching."""
    if snippet_lat is not None and snippet_lng is not None:
        rows = s.execute(
            text(
                """
                SELECT id::text, name, ST_Y(geom), ST_X(geom)
                FROM utah_poi
                WHERE source = 'ugrc'
                  AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :rad)
                """
            ),
            {"lat": float(snippet_lat), "lng": float(snippet_lng), "rad": radius_km * 1000},
        ).all()
    else:
        # Fallback: Moab-radius prefilter so we don't fuzzy-match against every
        # UGRC trail in the dataset.
        rows = s.execute(
            text(
                """
                SELECT id::text, name, ST_Y(geom), ST_X(geom)
                FROM utah_poi
                WHERE source = 'ugrc'
                  AND ST_DWithin(
                    geom::geography,
                    ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                    :rad
                  )
                """
            ),
            {
                "lat": settings.moab_lat,
                "lng": settings.moab_lng,
                "rad": settings.radius_mi * 1609.34,
            },
        ).all()
    return [(rid, name, lat, lng) for (rid, name, lat, lng) in rows]


def _best_match(
    mentioned: list[str],
    candidates: list[tuple[str, str, float, float]],
    threshold: int,
) -> tuple[list[tuple[str, str, int]], str | None]:
    """Score every (mention × candidate) pair. Returns (above-threshold hits,
    best mention used). Hits are (poi_id, poi_name, score) sorted desc.
    """
    if not mentioned or not candidates:
        return [], None

    scored: list[tuple[str, str, int, str]] = []  # (id, name, score, mention)
    for mention in mentioned:
        m = mention.strip()
        if len(m) < 5:
            continue
        mention_distinctive = _distinctive_tokens(m)
        if not mention_distinctive:
            continue  # mention is all-stopwords / generic
        for poi_id, poi_name, _, _ in candidates:
            poi_distinctive = _distinctive_tokens(poi_name)
            if not poi_distinctive or not (mention_distinctive & poi_distinctive):
                # No shared meaningful word — fuzzy ratio would be misleading.
                continue
            # Reject 1-token UGRC names against multi-token mentions: e.g.
            # "Cross" (poi) vs "Woods Cross" (mention) would otherwise score 100.
            if len(poi_distinctive) < 2 and len(mention_distinctive) >= 2:
                continue
            score = int(fuzz.token_set_ratio(m, poi_name))
            if score >= threshold:
                scored.append((poi_id, poi_name, score, m))

    if not scored:
        return [], None

    scored.sort(key=lambda x: -x[2])
    best_score = scored[0][2]
    top = [s for s in scored if s[2] == best_score]
    # Dedupe to unique POI ids at the top score.
    seen: set[str] = set()
    unique_top: list[tuple[str, str, int]] = []
    for poi_id, poi_name, score, _mention in top:
        if poi_id in seen:
            continue
        seen.add(poi_id)
        unique_top.append((poi_id, poi_name, score))
    return unique_top, top[0][3]


def _merge_signal(s, poi_id: str, source: str, payload: dict[str, Any]) -> None:
    """Append the snippet's enrichment under metadata_tags.community_signals.{source}.

    Uses chained `||` rather than `jsonb_set` because the latter cannot create
    a missing nested key path (`community_signals` itself may not yet exist).
    """
    s.execute(
        text(
            """
            UPDATE utah_poi
            SET metadata_tags = COALESCE(metadata_tags, '{}'::jsonb)
              || jsonb_build_object(
                'community_signals',
                COALESCE(metadata_tags->'community_signals', '{}'::jsonb)
                  || jsonb_build_object(
                    :source,
                    COALESCE(metadata_tags#>ARRAY['community_signals', :source], '[]'::jsonb)
                      || jsonb_build_array(CAST(:payload AS jsonb))
                  )
              )
            WHERE id = CAST(:id AS uuid)
            """
        ),
        {"id": poi_id, "source": source, "payload": _json_dump(payload)},
    )


def _json_dump(payload: dict[str, Any]) -> str:
    import json

    return json.dumps(payload, default=str)


def run_matcher(threshold: int = DEFAULT_THRESHOLD, radius_km: float = DEFAULT_RADIUS_KM) -> dict[str, int]:
    counts = {"matched": 0, "ambiguous": 0, "unmatched": 0, "skipped": 0}

    with session_scope() as s:
        rows = s.execute(
            select(
                Snippet.id,
                Snippet.source,
                Snippet.lat,
                Snippet.lng,
                Snippet.enrichment,
            ).where(
                Snippet.enriched_at.isnot(None),
                Snippet.matched_poi_id.is_(None),
                Snippet.promoted_poi_id.is_(None),
            )
        ).all()

        for snippet_id, source, lat, lng, enrichment in rows:
            mentioned = (enrichment or {}).get("mentioned_places") or []
            if not mentioned:
                counts["skipped"] += 1
                continue

            candidates = _candidate_pois(
                s,
                float(lat) if lat is not None else None,
                float(lng) if lng is not None else None,
                radius_km,
            )
            top, used_mention = _best_match(mentioned, candidates, threshold)

            if not top:
                counts["unmatched"] += 1
                continue

            if len(top) == 1:
                poi_id, poi_name, score = top[0]
                s.execute(
                    update(Snippet)
                    .where(Snippet.id == snippet_id)
                    .values(matched_poi_id=poi_id)
                )
                _merge_signal(
                    s,
                    poi_id,
                    source,
                    {
                        "snippet_id": str(snippet_id),
                        "matched_via": used_mention,
                        "score": score,
                        "enrichment": enrichment,
                    },
                )
                counts["matched"] += 1
            else:
                ambiguous = [{"id": pid, "name": pname, "score": s_} for (pid, pname, s_) in top]
                merged = dict(enrichment or {})
                merged["match_ambiguous"] = ambiguous
                s.execute(
                    update(Snippet)
                    .where(Snippet.id == snippet_id)
                    .values(enrichment=merged)
                )
                counts["ambiguous"] += 1

    return counts
