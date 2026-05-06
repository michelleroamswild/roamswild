"""master_places: deduplicated, multi-source-aware POI table

Revision ID: 0002_master_places
Revises: 0001_initial
Create Date: 2026-05-05
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID

revision: str = "0002_master_places"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "master_places",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("canonical_name", sa.Text(), nullable=False),
        sa.Column("geom", Geometry("POINT", srid=4326, spatial_index=False), nullable=False),
        sa.Column("poi_type", sa.Text(), nullable=False),
        sa.Column("source_count", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("sources", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("member_poi_ids", ARRAY(UUID(as_uuid=True)), nullable=False),
        sa.Column("is_hidden_gem", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("photo_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("locationscout_endorsed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("metadata_tags", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_master_places_geom", "master_places", ["geom"], postgresql_using="gist")
    op.create_index("idx_master_places_poi_type", "master_places", ["poi_type"])
    op.create_index("idx_master_places_source_count", "master_places", ["source_count"])
    op.create_index("idx_master_places_photo_count", "master_places", ["photo_count"])


def downgrade() -> None:
    op.drop_index("idx_master_places_photo_count", table_name="master_places")
    op.drop_index("idx_master_places_source_count", table_name="master_places")
    op.drop_index("idx_master_places_poi_type", table_name="master_places")
    op.drop_index("idx_master_places_geom", table_name="master_places")
    op.drop_table("master_places")
