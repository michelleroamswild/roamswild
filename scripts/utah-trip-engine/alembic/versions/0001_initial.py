"""initial schema: utah_poi, pilot_regions, poi_region, pipeline_runs

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    op.create_table(
        "utah_poi",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("geom", Geometry("POINT", srid=4326, spatial_index=False), nullable=False),
        sa.Column("elevation_ft", sa.Integer()),
        sa.Column("poi_type", sa.Text(), nullable=False),
        sa.Column("primary_use", sa.Text()),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("source_url", sa.Text()),
        sa.Column("source_external_id", sa.Text()),
        sa.Column("access_season", sa.Text()),
        sa.Column("is_hidden_gem", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("metadata_tags", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column(
            "matched_ugrc_id",
            UUID(as_uuid=True),
            sa.ForeignKey("utah_poi.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("source", "source_external_id", name="uq_utah_poi_source_extid"),
    )
    op.create_index("idx_utah_poi_geom", "utah_poi", ["geom"], postgresql_using="gist")
    op.create_index("idx_utah_poi_type", "utah_poi", ["poi_type"])
    op.create_index("idx_utah_poi_source", "utah_poi", ["source"])
    op.create_index(
        "idx_utah_poi_hidden_gem",
        "utah_poi",
        ["is_hidden_gem"],
        postgresql_where=sa.text("is_hidden_gem"),
    )

    op.create_table(
        "pilot_regions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("slug", sa.Text(), nullable=False, unique=True),
        sa.Column("region_type", sa.Text()),
        sa.Column("bounds", Geometry("MULTIPOLYGON", srid=4326, spatial_index=False), nullable=False),
        sa.Column("center", Geometry("POINT", srid=4326, spatial_index=False), nullable=False),
        sa.Column("area_sq_miles", sa.Numeric(10, 2)),
        sa.Column(
            "parent_region_id",
            UUID(as_uuid=True),
            sa.ForeignKey("pilot_regions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("tagline", sa.Text()),
        sa.Column("description", sa.Text()),
        sa.Column("metadata_tags", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("source_external_id", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("source", "source_external_id", name="uq_pilot_regions_source_extid"),
    )
    op.create_index("idx_pilot_regions_bounds_gist", "pilot_regions", ["bounds"], postgresql_using="gist")
    op.create_index("idx_pilot_regions_center_gist", "pilot_regions", ["center"], postgresql_using="gist")

    op.create_table(
        "poi_region",
        sa.Column(
            "poi_id",
            UUID(as_uuid=True),
            sa.ForeignKey("utah_poi.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "region_id",
            UUID(as_uuid=True),
            sa.ForeignKey("pilot_regions.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )

    op.create_table(
        "snippets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("source_external_id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text()),
        sa.Column("raw_text", sa.Text(), nullable=False),
        sa.Column("lat", sa.Numeric(10, 7)),
        sa.Column("lng", sa.Numeric(10, 7)),
        sa.Column("enrichment", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("enriched_at", sa.DateTime(timezone=True)),
        sa.Column(
            "matched_poi_id",
            UUID(as_uuid=True),
            sa.ForeignKey("utah_poi.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "promoted_poi_id",
            UUID(as_uuid=True),
            sa.ForeignKey("utah_poi.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("skipped_reason", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("source", "source_external_id", name="uq_snippets_source_extid"),
    )
    op.create_index("idx_snippets_source", "snippets", ["source"])
    op.create_index("idx_snippets_skipped_reason", "snippets", ["skipped_reason"])
    op.create_index("idx_snippets_enriched_at", "snippets", ["enriched_at"])

    op.create_table(
        "pipeline_runs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("stage", sa.Text(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'running'")),
        sa.Column("rows_in", sa.Integer(), server_default=sa.text("0")),
        sa.Column("rows_out", sa.Integer(), server_default=sa.text("0")),
        sa.Column("rows_skipped", sa.Integer(), server_default=sa.text("0")),
        sa.Column("rows_failed", sa.Integer(), server_default=sa.text("0")),
        sa.Column("llm_calls", sa.Integer(), server_default=sa.text("0")),
        sa.Column("llm_input_tokens", sa.Integer(), server_default=sa.text("0")),
        sa.Column("llm_output_tokens", sa.Integer(), server_default=sa.text("0")),
        sa.Column("llm_cache_hits", sa.Integer(), server_default=sa.text("0")),
        sa.Column("llm_cost_usd", sa.Numeric(10, 4), server_default=sa.text("0")),
        sa.Column("detail", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    op.create_index("idx_pipeline_runs_stage_started", "pipeline_runs", ["stage", "started_at"])


def downgrade() -> None:
    op.drop_index("idx_pipeline_runs_stage_started", table_name="pipeline_runs")
    op.drop_table("pipeline_runs")
    op.drop_index("idx_snippets_enriched_at", table_name="snippets")
    op.drop_index("idx_snippets_skipped_reason", table_name="snippets")
    op.drop_index("idx_snippets_source", table_name="snippets")
    op.drop_table("snippets")
    op.drop_table("poi_region")
    op.drop_index("idx_pilot_regions_center_gist", table_name="pilot_regions")
    op.drop_index("idx_pilot_regions_bounds_gist", table_name="pilot_regions")
    op.drop_table("pilot_regions")
    op.drop_index("idx_utah_poi_hidden_gem", table_name="utah_poi")
    op.drop_index("idx_utah_poi_source", table_name="utah_poi")
    op.drop_index("idx_utah_poi_type", table_name="utah_poi")
    op.drop_index("idx_utah_poi_geom", table_name="utah_poi")
    op.drop_table("utah_poi")
