from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal, Optional

from geoalchemy2 import Geometry
from pydantic import BaseModel, Field
from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, relationship


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# SQLAlchemy ORM
# ---------------------------------------------------------------------------


class UtahPOI(Base):
    """Point of interest within the Moab radius.

    A single record covers any feature we represent as a point: trails,
    trailheads, scenic overlooks, photography spots, slot canyons, hot
    springs, hidden gems. The `poi_type` column distinguishes them; the
    `metadata_tags` JSONB carries the LLM-extracted flavor.
    """

    __tablename__ = "utah_poi"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(Text, nullable=False)
    description = Column(Text)

    geom = Column(Geometry("POINT", srid=4326, spatial_index=False), nullable=False)
    elevation_ft = Column(Integer)

    poi_type = Column(Text, nullable=False)
    primary_use = Column(Text)

    source = Column(Text, nullable=False)
    source_url = Column(Text)
    source_external_id = Column(Text)

    access_season = Column(Text)
    is_hidden_gem = Column(Boolean, nullable=False, default=False)

    metadata_tags = Column(JSONB, nullable=False, default=dict)

    matched_ugrc_id = Column(
        UUID(as_uuid=True),
        ForeignKey("utah_poi.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        Index("idx_utah_poi_geom", "geom", postgresql_using="gist"),
        Index("idx_utah_poi_type", "poi_type"),
        Index("idx_utah_poi_source", "source"),
        Index(
            "idx_utah_poi_hidden_gem",
            "is_hidden_gem",
            postgresql_where=Column("is_hidden_gem"),
        ),
        UniqueConstraint("source", "source_external_id", name="uq_utah_poi_source_extid"),
    )


class PilotRegion(Base):
    """Polygon region (NP, NM, state park, wilderness, SRMA, …).

    Mirrors the production app's `regions` table shape so a future promotion
    is a straightforward dump → load.
    """

    __tablename__ = "pilot_regions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(Text, nullable=False)
    slug = Column(Text, nullable=False, unique=True)

    region_type = Column(Text)

    bounds = Column(Geometry("MULTIPOLYGON", srid=4326, spatial_index=False), nullable=False)
    center = Column(Geometry("POINT", srid=4326, spatial_index=False), nullable=False)
    area_sq_miles = Column(Numeric(10, 2))

    parent_region_id = Column(
        UUID(as_uuid=True),
        ForeignKey("pilot_regions.id", ondelete="SET NULL"),
        nullable=True,
    )

    tagline = Column(Text)
    description = Column(Text)
    metadata_tags = Column(JSONB, nullable=False, default=dict)

    source = Column(Text, nullable=False)
    source_external_id = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        Index("idx_pilot_regions_bounds_gist", "bounds", postgresql_using="gist"),
        Index("idx_pilot_regions_center_gist", "center", postgresql_using="gist"),
        UniqueConstraint("source", "source_external_id", name="uq_pilot_regions_source_extid"),
    )


class POIRegion(Base):
    """Many-to-many between POIs and regions, populated by spatial join."""

    __tablename__ = "poi_region"

    poi_id = Column(
        UUID(as_uuid=True),
        ForeignKey("utah_poi.id", ondelete="CASCADE"),
        primary_key=True,
    )
    region_id = Column(
        UUID(as_uuid=True),
        ForeignKey("pilot_regions.id", ondelete="CASCADE"),
        primary_key=True,
    )


class Snippet(Base):
    """Raw scraped text awaiting enrichment / matching.

    Snippets are produced by the scrapers, optionally annotated by the
    prefilter (`skipped_reason`), enriched by the LLM stage (writes back to
    `enrichment` + `enriched_at`), then either merged into a UGRC trail
    (`matched_poi_id`) or promoted to a standalone POI (`promoted_poi_id`).
    """

    __tablename__ = "snippets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source = Column(Text, nullable=False)
    source_url = Column(Text, nullable=False)
    source_external_id = Column(Text, nullable=False)

    name = Column(Text)
    raw_text = Column(Text, nullable=False)
    lat = Column(Numeric(10, 7))
    lng = Column(Numeric(10, 7))

    enrichment = Column(JSONB, nullable=False, default=dict)
    enriched_at = Column(DateTime(timezone=True))

    matched_poi_id = Column(
        UUID(as_uuid=True),
        ForeignKey("utah_poi.id", ondelete="SET NULL"),
        nullable=True,
    )
    promoted_poi_id = Column(
        UUID(as_uuid=True),
        ForeignKey("utah_poi.id", ondelete="SET NULL"),
        nullable=True,
    )
    skipped_reason = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("source", "source_external_id", name="uq_snippets_source_extid"),
        Index("idx_snippets_source", "source"),
        Index("idx_snippets_skipped_reason", "skipped_reason"),
        Index("idx_snippets_enriched_at", "enriched_at"),
    )


class PipelineRun(Base):
    """One row per CLI invocation. Tracks counts and LLM spend so the budget
    guard can sum across runs and halt at `BUDGET_CAP`.
    """

    __tablename__ = "pipeline_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    stage = Column(Text, nullable=False)
    started_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    finished_at = Column(DateTime(timezone=True))
    status = Column(Text, nullable=False, default="running")

    rows_in = Column(Integer, default=0)
    rows_out = Column(Integer, default=0)
    rows_skipped = Column(Integer, default=0)
    rows_failed = Column(Integer, default=0)

    llm_calls = Column(Integer, default=0)
    llm_input_tokens = Column(Integer, default=0)
    llm_output_tokens = Column(Integer, default=0)
    llm_cache_hits = Column(Integer, default=0)
    llm_cost_usd = Column(Numeric(10, 4), default=0)

    detail = Column(JSONB, nullable=False, default=dict)


# ---------------------------------------------------------------------------
# Pydantic DTOs
# ---------------------------------------------------------------------------


PoiTypeLiteral = Literal[
    "trail",
    "trailhead",
    "scenic_overlook",
    "photography_spot",
    "slot_canyon",
    "hot_spring",
    "arch",
    "petroglyph_site",
    "dark_sky_spot",
    "swimming_hole",
    "dinosaur_track",
    "hidden_gem",
    "other_landmark",
]

PrimaryUseLiteral = Literal[
    "Hiking",
    "Mountain Bike",
    "Motorized",
    "OHV",
    "Equestrian",
    "Multi-use",
]


class ScrapedSnippet(BaseModel):
    """Raw text pulled by a scraper before any enrichment."""

    name: Optional[str] = None
    raw_text: str
    source: str
    source_url: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    extra: dict[str, Any] = Field(default_factory=dict)


class EnrichedPOI(BaseModel):
    """Structured fields the LLM extracts from a snippet.

    The same shape is the Anthropic tool input_schema and the validator
    that gates writes into `utah_poi.metadata_tags`. `mentioned_places` and
    `summary` are snippet-level metadata used by the matcher / UI rather
    than POI characteristics, but live here so a single tool call covers
    everything we need from the LLM.
    """

    poi_type: PoiTypeLiteral = Field(
        description="Best-fit category for the place this snippet centers on. Use 'other_landmark' if unclear.",
    )
    name: Optional[str] = Field(
        default=None,
        description="Canonical place name extracted from the text, if a single subject can be identified.",
    )
    difficulty_rating: Optional[str] = Field(
        default=None,
        description="Stock | Modified | Extreme, or a 1-5 number as a string. Null if not stated.",
    )
    best_time: list[str] = Field(
        default_factory=list,
        description="Recommended times: e.g. 'Sunrise', 'Sunset', 'Golden Hour', 'Spring', 'Autumn', 'Avoid summer'.",
    )
    scenic_score: Optional[int] = Field(
        default=None,
        ge=1,
        le=10,
        description="1-10 score for visual / experiential drama, derived from the adjectives used.",
    )
    vehicle_requirements: list[str] = Field(
        default_factory=list,
        description="e.g. 'High Clearance', '4WD Required', 'Locker Recommended', 'AWD OK', 'Stock OK'.",
    )
    danger_tags: list[str] = Field(
        default_factory=list,
        description="e.g. 'Flash Flood Risk', 'Impassable when wet', 'Shelf Road', 'Exposure', 'Cliff edge'.",
    )
    primary_use: Optional[str] = Field(
        default=None,
        description=(
            "Primary recreation use, if this is a trail. Prefer the canonical values "
            "Hiking | Mountain Bike | Motorized | OHV | Equestrian | Multi-use. "
            "Leave null for non-trail POIs (overlooks, photo spots, swimming holes, "
            "petroglyphs, etc.)."
        ),
    )
    mentioned_places: list[str] = Field(
        default_factory=list,
        description="All distinct trail / road / landmark names mentioned in the text. Used by the matcher.",
    )
    summary: Optional[str] = Field(
        default=None,
        description="One sentence (~25 words) summarizing the experience or recommendation. Plain prose, no marketing.",
    )


class TrailFeature(BaseModel):
    """UGRC ArcGIS feature shape we care about."""

    object_id: int
    global_id: Optional[str] = None
    name: Optional[str] = None
    primary_use: Optional[str] = None
    geometry_type: Literal["LineString", "MultiLineString", "Point"]
    coordinates: list[Any]
    attributes: dict[str, Any] = Field(default_factory=dict)
