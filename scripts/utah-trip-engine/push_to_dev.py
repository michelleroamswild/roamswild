"""Push local `master_places` to a remote `points_of_interest` table.

Drop-and-recreate refresh: TRUNCATE the remote table, then bulk INSERT in
batches. Reads from the local pipeline DB (`utah_engine.config.settings`)
and writes to the URL given via ``--remote-url`` or ``POI_REMOTE_DATABASE_URL``.

Usage:
    export POI_REMOTE_DATABASE_URL='postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres'
    python push_to_dev.py --dry-run        # count + first row
    python push_to_dev.py                  # actually push

Per project policy: first remote failure stops the run. No retries.
"""
from __future__ import annotations

import json
import os
import sys
import time
from typing import Any

from urllib.parse import unquote, urlparse

import psycopg2
import psycopg2.extras
import typer

from utah_engine.config import settings


def _connect_remote(url: str, connect_timeout: int = 15):
    """Parse the URL ourselves and pass components as kwargs.

    psycopg2.connect(url=...) routes through libpq's URI parser, which mis-handles
    Supabase's pooler usernames of the form ``postgres.<project-ref>`` — it drops
    the dot-suffix and silently authenticates as plain ``postgres``. Passing the
    fields as keyword arguments preserves the username verbatim.
    """
    p = urlparse(url)
    return psycopg2.connect(
        host=p.hostname,
        port=p.port or 5432,
        user=unquote(p.username) if p.username else None,
        password=unquote(p.password) if p.password else None,
        dbname=(p.path or "/postgres").lstrip("/"),
        connect_timeout=connect_timeout,
    )

app = typer.Typer(help="Push master_places → remote points_of_interest.")

INSERT_SQL = """
    INSERT INTO points_of_interest (
        id, canonical_name, geom, poi_type, source_count, sources,
        is_hidden_gem, photo_count, locationscout_endorsed,
        metadata_tags, created_at, updated_at
    )
    VALUES (
        %(id)s, %(canonical_name)s, ST_GeomFromEWKT(%(geom_ewkt)s),
        %(poi_type)s, %(source_count)s, %(sources)s::jsonb,
        %(is_hidden_gem)s, %(photo_count)s, %(locationscout_endorsed)s,
        %(metadata_tags)s::jsonb, %(created_at)s, %(updated_at)s
    )
"""

SELECT_SQL = """
    SELECT id, canonical_name, ST_AsEWKT(geom) AS geom_ewkt, poi_type,
           source_count, sources, is_hidden_gem, photo_count,
           locationscout_endorsed, metadata_tags, created_at, updated_at
    FROM master_places
    ORDER BY source_count DESC, canonical_name
"""


def _local_dsn() -> str:
    """Convert the SQLAlchemy URL to a psycopg2-friendly DSN."""
    return settings.database_url.replace("postgresql+psycopg2://", "postgresql://")


@app.command()
def push(
    remote_url: str = typer.Option(
        None,
        "--remote-url",
        help="Postgres URL for the target DB. Falls back to POI_REMOTE_DATABASE_URL.",
        envvar="POI_REMOTE_DATABASE_URL",
    ),
    batch: int = typer.Option(100, help="Rows per INSERT batch."),
    dry_run: bool = typer.Option(False, "--dry-run", help="Count + sample row, don't push."),
    statement_timeout_ms: int = typer.Option(
        30000, help="Per-statement timeout on the remote DB (ms)."
    ),
) -> None:
    if not dry_run and not remote_url:
        raise typer.BadParameter(
            "--remote-url is required (or set POI_REMOTE_DATABASE_URL)"
        )

    typer.echo(f"[local]  {_local_dsn().split('@')[-1]}")
    if not dry_run:
        typer.echo(f"[remote] {remote_url.split('@')[-1]}")

    # ---- Pull from local ----
    with psycopg2.connect(_local_dsn()) as local:
        with local.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT COUNT(*) AS n FROM master_places")
            total = cur.fetchone()["n"]
            typer.echo(f"[local]  master_places rows: {total}")

            cur.execute(SELECT_SQL)
            rows = cur.fetchall()

    if dry_run:
        typer.echo(f"[dry-run] would push {len(rows)} rows")
        if rows:
            sample = dict(rows[0])
            sample["sources"] = (
                json.dumps(sample["sources"])[:120] + "..."
                if sample.get("sources")
                else None
            )
            sample["metadata_tags"] = (
                json.dumps(sample["metadata_tags"])[:120] + "..."
                if sample.get("metadata_tags")
                else None
            )
            typer.echo(f"[dry-run] sample row: {json.dumps(sample, default=str, indent=2)}")
        return

    # ---- Serialize JSONB ----
    payload: list[dict[str, Any]] = []
    for r in rows:
        d = dict(r)
        d["sources"] = json.dumps(d["sources"]) if d.get("sources") is not None else "[]"
        d["metadata_tags"] = json.dumps(d["metadata_tags"]) if d.get("metadata_tags") is not None else "{}"
        payload.append(d)

    # ---- Push to remote ----
    started = time.time()
    with _connect_remote(remote_url) as remote:
        with remote.cursor() as cur:
            cur.execute(f"SET statement_timeout = {statement_timeout_ms}")
            cur.execute("SELECT to_regclass('public.points_of_interest')")
            if cur.fetchone()[0] is None:
                typer.echo(
                    "[remote] points_of_interest table not found. Apply migration "
                    "20260255_points_of_interest.sql first.",
                    err=True,
                )
                raise typer.Exit(2)

            cur.execute("TRUNCATE points_of_interest")
            typer.echo("[remote] truncated points_of_interest")

            sent = 0
            for i in range(0, len(payload), batch):
                chunk = payload[i : i + batch]
                psycopg2.extras.execute_batch(cur, INSERT_SQL, chunk, page_size=batch)
                sent += len(chunk)
                typer.echo(f"[remote] inserted {sent}/{len(payload)}")
        remote.commit()

    elapsed = time.time() - started
    typer.echo(f"[done] pushed {len(payload)} rows in {elapsed:.1f}s")


if __name__ == "__main__":
    app()
