"""Region config loader + cleanup spec.

Pipeline runs per region. The YAML at ``data/regions.yaml`` defines each
region's anchor, radius, state, sources to enable, and per-source params
(NPS park codes, Reddit subs / gazetteer, Wikivoyage articles, seed-file
paths). Loading a region yields a typed ``RegionConfig`` other modules
can read.

The cleanup spec encodes the poi_type categories that should be deleted
across all regions to keep the dataset focused on outdoor highlights /
viewpoints / hikes / activities / photography. These were tuned during
the Moab pilot; reapplied verbatim in every region run.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

CONFIG_PATH = Path(__file__).parent.parent / "data" / "regions.yaml"


@dataclass
class RegionConfig:
    key: str
    name: str
    state: str
    anchor_lat: float
    anchor_lng: float
    radius_mi: float
    enabled_sources: list[str] = field(default_factory=list)
    nps_park_codes: list[str] = field(default_factory=list)
    reddit_subs: list[str] = field(default_factory=list)
    reddit_gazetteer: list[str] = field(default_factory=list)
    wikivoyage_articles: list[str] = field(default_factory=list)
    seed_files: dict[str, str] = field(default_factory=dict)

    @property
    def is_utah(self) -> bool:
        return self.state.upper() == "UT"

    def has_source(self, source: str) -> bool:
        if not self.enabled_sources:
            return True  # default: all
        return source in self.enabled_sources


def load_regions(path: Path | None = None) -> dict[str, RegionConfig]:
    p = path or CONFIG_PATH
    if not p.exists():
        raise FileNotFoundError(f"regions config not found at {p}")
    raw = yaml.safe_load(p.read_text()) or {}
    regions = (raw.get("regions") or {})
    out: dict[str, RegionConfig] = {}
    for key, body in regions.items():
        if not body:
            continue
        anchor = body.get("anchor") or [0, 0]
        out[key] = RegionConfig(
            key=key,
            name=body.get("name") or key,
            state=body.get("state") or "",
            anchor_lat=float(anchor[0]),
            anchor_lng=float(anchor[1]),
            radius_mi=float(body.get("radius_mi") or 50.0),
            enabled_sources=list(body.get("enabled_sources") or []),
            nps_park_codes=list(body.get("nps_park_codes") or []),
            reddit_subs=list(body.get("reddit_subs") or []),
            reddit_gazetteer=list(body.get("reddit_gazetteer") or []),
            wikivoyage_articles=list(body.get("wikivoyage_articles") or []),
            seed_files=dict(body.get("seed_files") or {}),
        )
    return out


def get_region(key: str, path: Path | None = None) -> RegionConfig:
    regions = load_regions(path)
    if key not in regions:
        raise KeyError(f"region {key!r} not found; available: {sorted(regions)}")
    return regions[key]


# ============================================================================
# Cleanup spec — encoded list of poi_types to delete in every region run.
# Tuned during the Moab pilot. Apply verbatim everywhere unless a region's
# config explicitly overrides.
# ============================================================================

# Categories explicitly removed during pilot prune rounds. Most are noise
# from OSM / UGRC OpenSourcePlaces (hotels, schools, churches, restaurants
# etc.) plus generic terrain that doesn't read as a "destination".
DEFAULT_CLEANUP_POI_TYPES: list[str] = [
    # OSM / OSP commercial / civic / lodging noise
    "graveyard", "civic", "commercial", "doityourself", "bicycle_rental",
    "religious", "butcher", "chalet", "courthouse", "hostel", "mobile_phone",
    "pharmacy", "playground", "recycling", "sports", "swimming_pool",
    "theatre", "theater", "beverages", "bookstore", "bar", "golf_course",
    "helipad", "town_hall", "mobile_phone_shop", "bookshop",
    # Round 2: more OSM/OSP cruft
    "campsite", "library", "christian_lutheran", "dog_park", "sports_shop",
    "hospital", "arts_centre",
    # Round 3
    "general", "memorial", "woods", "stadium", "visitor_center", "bay",
    "building", "lodging", "info", "infrastructure", "museum",
    # Round 4: generic terrain that doesn't read as a destination
    "valley", "flat", "basin", "river_bend", "bench", "plain", "slope",
    "car_wash", "river_bar",
]


@dataclass
class CleanupSpec:
    delete_poi_types: list[str] = field(default_factory=lambda: list(DEFAULT_CLEANUP_POI_TYPES))


def default_cleanup_spec() -> CleanupSpec:
    return CleanupSpec()
