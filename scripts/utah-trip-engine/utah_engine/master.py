"""Build the deduplicated `master_places` table.

For every ``utah_poi`` row from a geo / curated source we cluster rows
that look like the same real-world place: spatially close (default 300m)
AND fuzzy-name-matching (default token_set_ratio ≥ 78). Clusters become
one master row carrying:

  - canonical_name (longest meaningful member name)
  - geom (centroid of the cluster)
  - poi_type (most common, ties broken by source priority)
  - source_count + sources[] + member_poi_ids[]
  - is_hidden_gem / photo_count / locationscout_endorsed (max-aggregated)
  - metadata_tags merged

Excludes UGRC trails (those live on /trails) and Reddit-derived rows
(the inspection-page snippet pipeline isn't reliable enough for the
master surface).
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from typing import Any

from rapidfuzz import fuzz
from sqlalchemy import text

from utah_engine.db import session_scope

# Spatial + fuzzy thresholds
DEFAULT_DISTANCE_M = 300.0
DEFAULT_NAME_THRESHOLD = 78

# Source priority for tie-breaks. First wins.
_SOURCE_PRIORITY = (
    "gnis",
    "nps",
    "osm",
    "ugrc_osp",
    "nhd",
    "atlas_obscura",
    "darksky",
    "wikivoyage",
    "mrds",
)

# Sources excluded from the master surface. Snippet-derived (Reddit) rows
# shouldn't end up in the curated unified table.
_EXCLUDE_SOURCE_PREFIX = ("reddit:",)


_STOPWORDS = frozenset(
    {
        "the", "a", "an", "of", "and", "or",
        "trail", "trails", "trailhead", "road", "loop", "route",
        "site", "viewpoint", "overlook", "lookout",
        "moab", "utah", "national", "park", "monument", "forest",
        "north", "south", "east", "west", "upper", "lower", "main",
    }
)


class UnionFind:
    def __init__(self) -> None:
        self.parent: dict[str, str] = {}

    def make(self, x: str) -> None:
        self.parent.setdefault(x, x)

    def find(self, x: str) -> str:
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a: str, b: str) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[ra] = rb


def _distinctive_tokens(name: str) -> set[str]:
    out = set()
    for tok in re.findall(r"[a-z]+", (name or "").lower()):
        if len(tok) > 2 and tok not in _STOPWORDS:
            out.add(tok)
    return out


def _pick_canonical_name(rows: list[dict[str, Any]]) -> str:
    """Prefer the longest name with at least one distinctive token; fall
    back to the longest name overall."""
    best = ""
    best_score = -1
    for r in rows:
        name = (r.get("name") or "").strip()
        if not name:
            continue
        distinctive = len(_distinctive_tokens(name))
        score = distinctive * 1000 + len(name)
        if score > best_score:
            best_score = score
            best = name
    return best or "Unnamed"


def _pick_canonical_type(rows: list[dict[str, Any]]) -> str:
    counts = Counter(r.get("poi_type") or "other_landmark" for r in rows)
    top = counts.most_common()
    if not top:
        return "other_landmark"
    top_count = top[0][1]
    contenders = [t for t, c in top if c == top_count]
    if len(contenders) == 1:
        return contenders[0]
    by_priority = {r.get("source"): r.get("poi_type") for r in rows}
    for src in _SOURCE_PRIORITY:
        if src in by_priority and by_priority[src] in contenders:
            return by_priority[src]
    return contenders[0]


def consolidate(
    distance_m: float = DEFAULT_DISTANCE_M,
    name_threshold: int = DEFAULT_NAME_THRESHOLD,
) -> dict[str, int]:
    """Rebuild master_places from current utah_poi state."""

    excluded_pattern = " AND ".join(
        [f"poi.source NOT LIKE '{p}%'" for p in _EXCLUDE_SOURCE_PREFIX]
    )

    with session_scope() as s:
        # Truncate prior master rows so we always rebuild a coherent state.
        s.execute(text("TRUNCATE TABLE master_places"))

        # Pull every row eligible for the master surface.
        rows = s.execute(
            text(
                f"""
                SELECT poi.id::text                AS id,
                       poi.name                    AS name,
                       poi.poi_type                AS poi_type,
                       poi.source                  AS source,
                       poi.is_hidden_gem           AS is_hidden_gem,
                       poi.metadata_tags           AS metadata_tags,
                       (poi.metadata_tags->'wikimedia'->>'photo_count')::int AS photo_count,
                       poi.metadata_tags ? 'locationscout' AS has_locationscout,
                       ST_Y(geom) AS lat,
                       ST_X(geom) AS lng
                FROM utah_poi poi
                WHERE poi.source != 'ugrc'
                  AND {excluded_pattern}
                """
            )
        ).mappings().all()
        rows = [dict(r) for r in rows]

        uf = UnionFind()
        for r in rows:
            uf.make(r["id"])

        # For each row, find spatial neighbors and union if name matches.
        # We do this with an indexed PostGIS lookup per row.
        for r in rows:
            neighbors = s.execute(
                text(
                    """
                    SELECT id::text AS id, name
                    FROM utah_poi
                    WHERE source != 'ugrc'
                      AND id::text != :self_id
                      AND ST_DWithin(
                        geom::geography,
                        ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                        :rad
                      )
                    """
                ),
                {"self_id": r["id"], "lat": r["lat"], "lng": r["lng"], "rad": distance_m},
            ).mappings().all()

            self_distinctive = _distinctive_tokens(r["name"])
            for n in neighbors:
                # Distinctive-token requirement: both sides must share at
                # least one meaningful token. Prevents "Cross" + "Woods Cross"
                # type false-merges.
                neigh_distinctive = _distinctive_tokens(n["name"])
                if not (self_distinctive & neigh_distinctive):
                    continue
                if min(len(self_distinctive), len(neigh_distinctive)) < 1:
                    continue
                if int(fuzz.token_set_ratio(r["name"] or "", n["name"] or "")) < name_threshold:
                    continue
                uf.union(r["id"], n["id"])

        # Group rows by cluster root.
        clusters: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for r in rows:
            clusters[uf.find(r["id"])].append(r)

        # Build master rows.
        for root, members in clusters.items():
            sources = sorted({m["source"] for m in members})
            poi_type = _pick_canonical_type(members)
            canonical_name = _pick_canonical_name(members)

            avg_lat = sum(float(m["lat"]) for m in members) / len(members)
            avg_lng = sum(float(m["lng"]) for m in members) / len(members)

            photo_counts = [m.get("photo_count") for m in members if m.get("photo_count")]
            photo_count = max(photo_counts) if photo_counts else 0

            is_gem = any(bool(m.get("is_hidden_gem")) for m in members)
            ls_endorsed = any(bool(m.get("has_locationscout")) for m in members)

            merged_tags: dict[str, Any] = {}
            for m in members:
                tags = m.get("metadata_tags") or {}
                # Avoid blowing up master.metadata_tags by including bulky
                # raw GIS attribute dumps. Pick selected keys.
                for key in (
                    "summary", "description", "wikimedia",
                    "locationscout", "tags", "best_time",
                    "vehicle_requirements", "danger_tags",
                    "scenic_score", "difficulty_rating",
                ):
                    if key in tags and key not in merged_tags:
                        merged_tags[key] = tags[key]

            member_ids = [m["id"] for m in members]

            s.execute(
                text(
                    """
                    INSERT INTO master_places
                        (canonical_name, geom, poi_type, source_count, sources,
                         member_poi_ids, is_hidden_gem, photo_count,
                         locationscout_endorsed, metadata_tags)
                    VALUES (
                        :name,
                        ST_SetSRID(ST_MakePoint(:lng, :lat), 4326),
                        :poi_type,
                        :source_count,
                        CAST(:sources AS jsonb),
                        CAST(:member_ids AS uuid[]),
                        :is_gem,
                        :photo_count,
                        :ls,
                        CAST(:tags AS jsonb)
                    )
                    """
                ),
                {
                    "name": canonical_name,
                    "lng": avg_lng,
                    "lat": avg_lat,
                    "poi_type": poi_type,
                    "source_count": len(sources),
                    "sources": _json(sources),
                    "member_ids": "{" + ",".join(member_ids) + "}",
                    "is_gem": is_gem,
                    "photo_count": photo_count,
                    "ls": ls_endorsed,
                    "tags": _json(merged_tags),
                },
            )

        total_master = s.execute(text("SELECT count(*) FROM master_places")).scalar_one()
        with_multi = s.execute(
            text("SELECT count(*) FROM master_places WHERE source_count >= 2")
        ).scalar_one()

    return {
        "input_rows": len(rows),
        "master_rows": total_master,
        "rows_confirmed_by_2plus": with_multi,
    }


def _json(p: Any) -> str:
    import json
    return json.dumps(p, default=str)
