"""CLI entry point for the Utah trip-engine pilot.

Each subcommand maps to a pipeline stage. Stages that aren't implemented
yet print a clear NotImplementedError so reruns of `run-all` fail loud
rather than silently skipping.
"""
from __future__ import annotations

import sys

import typer
from sqlalchemy import text

from utah_engine.config import set_active_region, settings
from utah_engine.db import session_scope
from utah_engine.region_config import RegionConfig, get_region


def _apply_region(region_key: str | None) -> RegionConfig | None:
    """If `region_key` is set, load its config and repoint settings to its anchor.

    Returns the loaded RegionConfig (or None when no region was requested) so
    callers can pull source-specific lists (NPS park codes, Reddit subs, etc.).
    """
    if not region_key:
        return None
    rc = get_region(region_key)
    set_active_region(rc.anchor_lat, rc.anchor_lng, rc.radius_mi)
    typer.echo(f"[region] {rc.key} — {rc.name} @ {rc.anchor_lat:.4f},{rc.anchor_lng:.4f} r={rc.radius_mi}mi")
    return rc

app = typer.Typer(help="RoamsWild Utah trip-engine pilot (Moab, 50mi radius).")
ingest_app = typer.Typer(help="Pull authoritative geo data.")
scrape_app = typer.Typer(help="Run community-source scrapers.")
app.add_typer(ingest_app, name="ingest")
app.add_typer(scrape_app, name="scrape")


# ---------------------------------------------------------------------------
# Diagnostic
# ---------------------------------------------------------------------------


@app.command("db-status")
def db_status() -> None:
    """Connect to the configured database and report PostGIS + table state."""
    typer.echo(f"DATABASE_URL: {settings.database_url}")
    try:
        with session_scope() as s:
            postgis_version = s.execute(text("SELECT PostGIS_Version()")).scalar()
            tables = s.execute(
                text(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema = 'public' ORDER BY table_name"
                )
            ).scalars().all()
        typer.echo(f"PostGIS: {postgis_version}")
        typer.echo(f"Tables ({len(tables)}): {', '.join(tables) or '(none — run `alembic upgrade head`)'}")
    except Exception as exc:  # noqa: BLE001
        typer.echo(f"DB connection failed: {exc}", err=True)
        raise typer.Exit(code=1)


@app.command("serve")
def serve(
    host: str = typer.Option("127.0.0.1", help="Bind host."),
    port: int = typer.Option(8765, help="Bind port."),
    reload: bool = typer.Option(False, "--reload", help="Auto-reload on file changes."),
) -> None:
    """Run the inspection page at http://localhost:{port}."""
    import uvicorn

    typer.echo(f"Inspection page → http://{host}:{port}/")
    uvicorn.run("utah_engine.server:app", host=host, port=port, reload=reload)


@app.command("config")
def show_config() -> None:
    """Print the loaded configuration (without secrets)."""
    typer.echo(f"Anchor: {settings.moab_lat}, {settings.moab_lng}")
    typer.echo(f"Radius: {settings.radius_mi} mi")
    typer.echo(f"Budget cap: ${settings.budget_cap}")
    typer.echo(f"LLM model: {settings.anthropic_model}")
    typer.echo(f"ANTHROPIC_API_KEY: {'set' if settings.anthropic_api_key else 'NOT SET'}")


# ---------------------------------------------------------------------------
# Ingest stages
# ---------------------------------------------------------------------------


@ingest_app.command("ugrc")
def ingest_ugrc(
    radius_mi: float = typer.Option(None, help="Override RADIUS_MI from .env."),
    limit: int = typer.Option(0, help="Cap features fetched (0 = no cap)."),
) -> None:
    """Pull UGRC Trails and Pathways within the Moab radius."""
    from utah_engine.ugrc import ingest_ugrc as _run

    kept, skipped = _run(radius_mi=radius_mi, limit=limit)
    typer.echo(f"UGRC ingest: kept {kept}, skipped {skipped}")


@ingest_app.command("gnis")
def ingest_gnis(
    radius_mi: float = typer.Option(None, help="Override RADIUS_MI from .env."),
    limit: int = typer.Option(0, help="Cap features per layer (0 = no cap)."),
) -> None:
    """Pull GNIS named natural features (arches, springs, summits, etc.)."""
    from utah_engine.gnis import ingest_gnis as _run

    counts = _run(radius_mi=radius_mi, limit=limit)
    typer.echo("GNIS ingest:")
    for label, n in counts.items():
        typer.echo(f"  {label}: {n}")


@ingest_app.command("locationscout")
def ingest_locationscout(
    threshold: int = typer.Option(78, help="rapidfuzz name-match threshold."),
    max_pages: int = typer.Option(50, help="Max index pages to walk."),
) -> None:
    """Use locationscout's Utah listings to endorse existing GNIS/OSM POIs as hidden gems."""
    from utah_engine.scrapers.locationscout import (
        apply_endorsements,
        harvest_listings,
    )

    listings = harvest_listings(max_pages=max_pages)
    typer.echo(f"Harvested {len(listings)} unique locationscout spots")
    summary = apply_endorsements(listings, threshold=threshold)
    typer.echo("Endorsement results:")
    for k, v in summary.items():
        typer.echo(f"  {k}: {v}")


@ingest_app.command("seed")
def ingest_seed(
    file: str = typer.Option(
        "data/atlas_obscura_seed.json",
        help="Path to a JSON seed file (list of {slug, name, lat, lng, description}).",
    ),
    source: str = typer.Option("atlas_obscura", help="Source label written into utah_poi.source."),
    poi_type: str = typer.Option("hidden_gem", help="poi_type for all rows in the file."),
    enforce_radius: bool = typer.Option(
        True,
        "--enforce-radius/--no-enforce-radius",
        help="Skip rows outside RADIUS_MI from Moab. Disable for state-wide datasets.",
    ),
) -> None:
    """Load a hand-curated POI list from a JSON seed file."""
    from pathlib import Path

    from utah_engine.seeded import ingest_seed_file

    counts = ingest_seed_file(
        Path(file), source=source, poi_type=poi_type, enforce_radius=enforce_radius
    )
    typer.echo(f"Seed ingest from {file}:")
    for k, v in counts.items():
        typer.echo(f"  {k}: {v}")


@ingest_app.command("wikimedia-photos")
def ingest_wikimedia_photos(
    radius_mi: float = typer.Option(None, help="Override RADIUS_MI from .env."),
    cluster_radius_m: float = typer.Option(300.0, help="Max distance to associate a photo with a POI."),
) -> None:
    """Annotate POIs with Wikimedia Commons photo density (popularity signal)."""
    from utah_engine.wikimedia import assign_to_pois, harvest_photos

    typer.echo("Harvesting Wikimedia Commons photos in Moab radius…")
    photos = harvest_photos(radius_mi=radius_mi)
    typer.echo(f"Harvested {len(photos)} unique photos")
    counts = assign_to_pois(photos, cluster_radius_m=cluster_radius_m)
    typer.echo("Wikimedia photo annotation results:")
    for k, v in counts.items():
        typer.echo(f"  {k}: {v}")


@ingest_app.command("nrhp")
def ingest_nrhp_cmd(
    radius_mi: float = typer.Option(None, help="Override RADIUS_MI from .env."),
) -> None:
    """Pull NRHP (National Register of Historic Places) Utah listings."""
    from utah_engine.nrhp import ingest_nrhp

    counts = ingest_nrhp(radius_mi=radius_mi)
    typer.echo("NRHP ingest:")
    for k, v in counts.items():
        typer.echo(f"  {k}: {v}")


@ingest_app.command("nhd")
def ingest_nhd_cmd(
    radius_mi: float = typer.Option(None, help="Override RADIUS_MI from .env."),
) -> None:
    """Pull NHD named hydrography points (springs, falls, geysers)."""
    from utah_engine.nhd import ingest_nhd

    counts = ingest_nhd(radius_mi=radius_mi)
    typer.echo(f"NHD ingest: kept {counts['kept']}, skipped {counts['skipped']}")


@ingest_app.command("nps-places")
def ingest_nps_places_cmd(
    region: str = typer.Option(None, help="Region key (from data/regions.yaml). Overrides default park codes."),
) -> None:
    """Pull NPS in-park named POIs (overlooks, trailheads, scenic features)."""
    from utah_engine.nps_places import ingest_nps_places

    rc = _apply_region(region)
    if rc and rc.nps_park_codes:
        counts = ingest_nps_places(park_codes=tuple(rc.nps_park_codes))
    else:
        counts = ingest_nps_places()
    typer.echo("NPS Places ingest:")
    for k, v in counts.items():
        typer.echo(f"  {k}: {v}")


@ingest_app.command("mrds")
def ingest_mrds_cmd(
    radius_mi: float = typer.Option(None, help="Override RADIUS_MI from .env."),
) -> None:
    """Pull MRDS historical mines + ghost-town markers."""
    from utah_engine.mrds import ingest_mrds

    counts = ingest_mrds(radius_mi=radius_mi)
    typer.echo("MRDS ingest:")
    for k, v in counts.items():
        typer.echo(f"  {k}: {v}")


@ingest_app.command("wikivoyage")
def ingest_wikivoyage_cmd(
    radius_mi: float = typer.Option(None, help="Override RADIUS_MI from .env."),
    region: str = typer.Option(None, help="Region key (from data/regions.yaml). Overrides default articles."),
) -> None:
    """Pull geo-tagged listings from Wikivoyage articles."""
    from utah_engine.wikivoyage import ingest_wikivoyage

    rc = _apply_region(region)
    if rc and rc.wikivoyage_articles:
        counts = ingest_wikivoyage(radius_mi=radius_mi, articles=tuple(rc.wikivoyage_articles))
    else:
        counts = ingest_wikivoyage(radius_mi=radius_mi)
    typer.echo("Wikivoyage ingest:")
    for k, v in counts.items():
        typer.echo(f"  {k}: {v}")


@ingest_app.command("atlas-obscura")
def ingest_atlas_obscura(
    radius_mi: float = typer.Option(None, help="Override RADIUS_MI from .env."),
    max_pages: int = typer.Option(25, help="Max index pages to walk."),
) -> None:
    """Pull Atlas Obscura's Utah hidden-gem places via Playwright."""
    from utah_engine.scrapers.atlas_obscura import ingest_atlas_obscura as _run

    counts = _run(radius_mi=radius_mi, max_index_pages=max_pages)
    typer.echo("Atlas Obscura ingest:")
    for k, v in counts.items():
        typer.echo(f"  {k}: {v}")


@ingest_app.command("osp")
def ingest_osp(
    radius_mi: float = typer.Option(None, help="Override RADIUS_MI from .env."),
) -> None:
    """Pull UGRC's OpenSourcePlaces (cleaned Utah OSM, structured columns)."""
    from utah_engine.ugrc_osp import ingest_open_source_places

    counts = ingest_open_source_places(radius_mi=radius_mi)
    typer.echo(f"OpenSourcePlaces ingest: kept {counts['kept']}, skipped {counts['skipped']}")


@ingest_app.command("osm")
def ingest_osm(
    radius_mi: float = typer.Option(None, help="Override RADIUS_MI from .env."),
) -> None:
    """Pull OpenStreetMap natural / tourism / historic features via Overpass."""
    from utah_engine.osm import ingest_osm as _run

    n = _run(radius_mi=radius_mi)
    typer.echo(f"OSM ingest: {n} features kept")


@app.command("enrich-master")
def enrich_master(
    min_sources_for_vision: int = typer.Option(
        3, help="Only run vision LLM on master_places with source_count >= this."
    ),
    skip_vision: bool = typer.Option(False, "--skip-vision", help="Skip the paid vision pass."),
) -> None:
    """Run all Tier 1 enrichment + Tier 3a vision pass over master_places."""
    from utah_engine import master_enrichment as me

    print("[1/7] Reddit-snippet cross-link…")
    typer.echo(f"  {me.link_reddit_signals()}")
    print("[2/7] Activity tags…")
    typer.echo(f"  {me.derive_activity_tags()}")
    print("[3/7] Crowdedness heuristic…")
    typer.echo(f"  {me.compute_crowdedness()}")
    print("[4/7] Wikimedia thumbnails…")
    typer.echo(f"  {me.resolve_thumbnails()}")
    print("[5/7] Sun ephemeris…")
    typer.echo(f"  {me.compute_sun_ephemeris()}")
    print("[6/7] Nearby spots…")
    typer.echo(f"  {me.compute_nearby()}")
    print("[6b] Derived hidden-gem signal…")
    typer.echo(f"  {me.compute_derived_gems()}")
    if skip_vision:
        typer.echo("[7/7] Vision LLM — skipped (--skip-vision).")
    else:
        print(f"[7/7] Vision LLM (source_count >= {min_sources_for_vision})…")
        typer.echo(f"  {me.enrich_with_vision(only_min_sources=min_sources_for_vision)}")


@app.command("consolidate")
def consolidate_master(
    distance_m: float = typer.Option(300.0, help="Spatial cluster radius (meters)."),
    name_threshold: int = typer.Option(78, help="rapidfuzz token_set_ratio threshold."),
) -> None:
    """Rebuild master_places: deduplicated, multi-source-aware POI table."""
    from utah_engine.master import consolidate

    counts = consolidate(distance_m=distance_m, name_threshold=name_threshold)
    typer.echo("Master places rebuild:")
    for k, v in counts.items():
        typer.echo(f"  {k}: {v}")


@app.command("cross-reference")
def cross_reference(
    distance_m: float = typer.Option(250.0, help="Spatial proximity threshold (meters)."),
    name_threshold: int = typer.Option(78, help="rapidfuzz token_set_ratio threshold."),
) -> None:
    """Mark (GNIS, OSM) duplicates without deleting either row."""
    from utah_engine.osm import mark_cross_references

    counts = mark_cross_references(distance_m=distance_m, name_threshold=name_threshold)
    typer.echo("Cross-reference results:")
    for k, v in counts.items():
        typer.echo(f"  {k}: {v}")


@ingest_app.command("regions")
def ingest_regions() -> None:
    """Pull region polygons (NPS / BLM / state-park / USFS) within the radius."""
    from utah_engine.regions import ingest_regions as _run

    counts = _run()
    total = sum(counts.values())
    typer.echo(f"Regions ingest: {total} kept across sources")
    for svc, n in counts.items():
        typer.echo(f"  {svc}: {n}")


# ---------------------------------------------------------------------------
# Scrape
# ---------------------------------------------------------------------------


@scrape_app.command("all")
def scrape_all() -> None:
    """Run every configured scraper."""
    raise NotImplementedError("Scrape-all not yet implemented.")


@scrape_app.command("reddit")
def scrape_reddit(
    subs: str = typer.Option(
        "Moab,overlanding,Utah,CampingandHiking,hiking",
        help="Comma-separated subreddit names (no r/ prefix).",
    ),
    limit: int = typer.Option(100, help="Posts per subreddit."),
    region: str = typer.Option(None, help="Region key (from data/regions.yaml). Overrides subs/gazetteer."),
) -> None:
    """Pull region-mentioning posts from configured subreddits."""
    from utah_engine.scrapers.base import persist_snippets
    from utah_engine.scrapers.reddit import RedditScraper

    rc = _apply_region(region)
    if rc and rc.reddit_subs:
        sub_tuple = tuple(rc.reddit_subs)
    else:
        sub_tuple = tuple(s.strip().lstrip("r/") for s in subs.split(",") if s.strip())
    gazetteer = tuple(rc.reddit_gazetteer) if rc and rc.reddit_gazetteer else None
    scraper = RedditScraper(subs=sub_tuple, limit_per_sub=limit, gazetteer=gazetteer)
    new, updated = persist_snippets(scraper.run())
    typer.echo(f"Reddit scrape: {new} new, {updated} updated")


# ---------------------------------------------------------------------------
# Enrichment + downstream
# ---------------------------------------------------------------------------


@app.command("prefilter")
def prefilter(
    reset: bool = typer.Option(False, "--reset", help="Clear existing skipped_reason values first."),
) -> None:
    """Mark snippets as junk before they reach the LLM."""
    from utah_engine.prefilter import reset_prefilter, run_prefilter

    if reset:
        cleared = reset_prefilter()
        typer.echo(f"Cleared skipped_reason on {cleared} rows")
    counts = run_prefilter()
    total = sum(counts.values())
    typer.echo(f"Prefilter classified {total} snippets:")
    for reason, n in sorted(counts.items(), key=lambda kv: (kv[0] != "passed", -kv[1])):
        typer.echo(f"  {reason}: {n}")


@app.command("enrich")
def enrich(
    batch: int = typer.Option(50, help="Snippets per LLM batch."),
    dry_run: bool = typer.Option(False, "--dry-run", help="Print cost estimate, don't call API."),
) -> None:
    """Anthropic Claude tool-use extraction with budget guard."""
    from utah_engine.enrichment import enrich_pending

    summary = enrich_pending(batch=batch, dry_run=dry_run)
    for key in (
        "dry_run",
        "candidates",
        "avg_chars",
        "estimated_cost_usd",
        "budget_cap_usd",
        "processed",
        "cache_hits",
        "failures",
        "remaining",
        "spent_usd",
        "calls",
        "elapsed_s",
        "halted_reason",
    ):
        if key in summary and summary[key] is not None:
            typer.echo(f"  {key}: {summary[key]}")


@app.command("match")
def match(
    threshold: int = typer.Option(80, help="rapidfuzz token_set_ratio threshold."),
    radius_km: float = typer.Option(5.0, help="Spatial pre-filter radius."),
) -> None:
    """Link enriched snippets to UGRC trails."""
    from utah_engine.matcher import run_matcher

    counts = run_matcher(threshold=threshold, radius_km=radius_km)
    typer.echo("Matcher results:")
    for k, v in counts.items():
        typer.echo(f"  {k}: {v}")


@app.command("classify")
def classify() -> None:
    """Promote unmatched community snippets to standalone POIs."""
    from utah_engine.classifier import run_classifier

    counts = run_classifier()
    typer.echo("Classifier results:")
    for k, v in counts.items():
        typer.echo(f"  {k}: {v}")


@app.command("link-regions")
def link_regions() -> None:
    """Spatial join populating poi_region."""
    from utah_engine.region_link import link_pois_to_regions

    n = link_pois_to_regions()
    typer.echo(f"Region linking added {n} poi×region pairings")


@app.command("seasons")
def seasons() -> None:
    """Apply elevation-based seasonality."""
    raise NotImplementedError("Seasonality not yet implemented.")


@app.command("run-all")
def run_all() -> None:
    """End-to-end pilot pass with summary report."""
    raise NotImplementedError("run-all not yet implemented.")


# ---------------------------------------------------------------------------
# Multi-region orchestration
# ---------------------------------------------------------------------------


@app.command("regions-list")
def regions_list() -> None:
    """List configured regions from data/regions.yaml."""
    from utah_engine.region_config import load_regions

    regions = load_regions()
    if not regions:
        typer.echo("No regions configured.")
        return
    typer.echo(f"{len(regions)} region(s):")
    for key, rc in regions.items():
        typer.echo(
            f"  {key:<14} {rc.name:<30} state={rc.state} "
            f"anchor={rc.anchor_lat:.3f},{rc.anchor_lng:.3f} r={rc.radius_mi}mi "
            f"sources={len(rc.enabled_sources)}"
        )


@app.command("cleanup")
def cleanup_region(
    region: str = typer.Option(..., help="Region key. Limits deletes to this region's radius."),
    dry_run: bool = typer.Option(False, "--dry-run", help="Print counts only, don't delete."),
) -> None:
    """Delete utah_poi rows with noise poi_types inside the region radius."""
    from sqlalchemy import text

    from utah_engine.region_config import default_cleanup_spec

    rc = _apply_region(region)
    if rc is None:
        raise typer.BadParameter("region required")
    spec = default_cleanup_spec()
    radius_m = rc.radius_mi * 1609.34

    sql_count = text(
        """
        SELECT poi_type, COUNT(*) AS n
        FROM utah_poi
        WHERE poi_type = ANY(:types)
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
            :radius_m
          )
        GROUP BY poi_type
        ORDER BY n DESC
        """
    )
    sql_delete = text(
        """
        DELETE FROM utah_poi
        WHERE poi_type = ANY(:types)
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
            :radius_m
          )
        """
    )
    params = {
        "types": list(spec.delete_poi_types),
        "lat": rc.anchor_lat,
        "lng": rc.anchor_lng,
        "radius_m": radius_m,
    }
    with session_scope() as s:
        rows = s.execute(sql_count, params).all()
        total = sum(n for _, n in rows)
        typer.echo(f"[{rc.key}] {total} rows match cleanup spec across {len(rows)} poi_types")
        for poi_type, n in rows:
            typer.echo(f"  {poi_type}: {n}")
        if dry_run or total == 0:
            return
        if not typer.confirm(f"Delete {total} rows?", default=False):
            typer.echo("Aborted.")
            return
        s.execute(sql_delete, params)
    typer.echo(f"Deleted {total} rows.")


@app.command("run-region")
def run_region(
    region: str = typer.Argument(..., help="Region key from data/regions.yaml."),
    skip_vision: bool = typer.Option(False, "--skip-vision", help="Skip the paid vision LLM pass."),
    skip_enrich: bool = typer.Option(False, "--skip-enrich", help="Skip the snippet-enrichment LLM pass."),
    cleanup: bool = typer.Option(True, "--cleanup/--no-cleanup", help="Run cleanup spec after consolidation."),
) -> None:
    """End-to-end pipeline for a region.

    Reads `data/regions.yaml`, repoints the in-process anchor, runs every
    enabled source, then prefilter → enrich → match → classify → link-regions
    → consolidate → cleanup → enrich-master.

    Sources flagged Utah-only (`ugrc`, `regions`, `osp`, `locationscout`) are
    skipped automatically when `state != UT`.
    """
    rc = _apply_region(region)
    if rc is None:
        raise typer.BadParameter("region required")

    enabled = set(rc.enabled_sources) if rc.enabled_sources else None

    def _on(source: str) -> bool:
        if enabled is None:
            return True
        return source in enabled

    utah_only = {"ugrc", "regions", "osp", "locationscout"}

    # ---- Ingest sources ----
    if _on("ugrc") and rc.is_utah:
        from utah_engine.ugrc import ingest_ugrc as _ugrc
        typer.echo("[ingest] ugrc")
        _ugrc(radius_mi=None, limit=0)
    if _on("regions") and rc.is_utah:
        from utah_engine.regions import ingest_regions as _regions
        typer.echo("[ingest] regions")
        _regions()
    if _on("osp") and rc.is_utah:
        from utah_engine.ugrc_osp import ingest_open_source_places as _osp
        typer.echo("[ingest] osp")
        _osp(radius_mi=None)
    if _on("gnis"):
        from utah_engine.gnis import ingest_gnis as _gnis
        typer.echo("[ingest] gnis")
        _gnis(radius_mi=None, limit=0)
    if _on("osm"):
        from utah_engine.osm import ingest_osm as _osm
        typer.echo("[ingest] osm")
        _osm(radius_mi=None)
    if _on("nhd"):
        from utah_engine.nhd import ingest_nhd as _nhd
        typer.echo("[ingest] nhd")
        _nhd(radius_mi=None)
    if _on("nps-places") and rc.nps_park_codes:
        from utah_engine.nps_places import ingest_nps_places as _nps
        typer.echo(f"[ingest] nps-places ({len(rc.nps_park_codes)} parks)")
        _nps(park_codes=tuple(rc.nps_park_codes))
    if _on("nrhp"):
        from utah_engine.nrhp import ingest_nrhp as _nrhp
        typer.echo("[ingest] nrhp")
        _nrhp(radius_mi=None)
    if _on("mrds"):
        from utah_engine.mrds import ingest_mrds as _mrds
        typer.echo("[ingest] mrds")
        _mrds(radius_mi=None)
    if _on("reddit") and rc.reddit_subs:
        from utah_engine.scrapers.base import persist_snippets
        from utah_engine.scrapers.reddit import RedditScraper
        typer.echo(f"[scrape] reddit ({len(rc.reddit_subs)} subs)")
        scraper = RedditScraper(
            subs=tuple(rc.reddit_subs),
            limit_per_sub=100,
            gazetteer=tuple(rc.reddit_gazetteer) if rc.reddit_gazetteer else None,
        )
        persist_snippets(scraper.run())
    if _on("wikivoyage") and rc.wikivoyage_articles:
        from utah_engine.wikivoyage import ingest_wikivoyage as _wv
        typer.echo(f"[ingest] wikivoyage ({len(rc.wikivoyage_articles)} articles)")
        _wv(radius_mi=None, articles=tuple(rc.wikivoyage_articles))
    if _on("wikimedia"):
        from utah_engine.wikimedia import assign_to_pois, harvest_photos
        typer.echo("[ingest] wikimedia photos")
        photos = harvest_photos(radius_mi=None)
        assign_to_pois(photos)
    for source_key, path in rc.seed_files.items():
        flag = f"seed:{source_key}"
        if not _on(flag):
            continue
        from pathlib import Path
        from utah_engine.seeded import ingest_seed_file
        typer.echo(f"[ingest] {flag} ← {path}")
        ingest_seed_file(Path(path), source=source_key, poi_type="hidden_gem")
    if _on("locationscout") and rc.is_utah:
        from utah_engine.scrapers.locationscout import apply_endorsements, harvest_listings
        typer.echo("[ingest] locationscout (endorsement layer)")
        apply_endorsements(harvest_listings(max_pages=50))

    # Skip-source warnings for UT-only sources outside Utah
    if not rc.is_utah:
        for s in utah_only:
            if _on(s):
                typer.echo(f"[skip] {s} — Utah-only source skipped for state={rc.state}")

    # ---- Pipeline stages ----
    typer.echo("[stage] prefilter")
    from utah_engine.prefilter import run_prefilter
    run_prefilter()

    if not skip_enrich:
        typer.echo("[stage] enrich")
        from utah_engine.enrichment import enrich_pending
        enrich_pending(batch=50, dry_run=False)

    typer.echo("[stage] match")
    from utah_engine.matcher import run_matcher
    run_matcher(threshold=80, radius_km=5.0)

    typer.echo("[stage] classify")
    from utah_engine.classifier import run_classifier
    run_classifier()

    typer.echo("[stage] link-regions")
    from utah_engine.region_link import link_pois_to_regions
    link_pois_to_regions()

    typer.echo("[stage] consolidate")
    from utah_engine.master import consolidate
    consolidate(distance_m=300.0, name_threshold=78)

    if cleanup:
        typer.echo("[stage] cleanup")
        from sqlalchemy import text
        from utah_engine.region_config import default_cleanup_spec
        spec = default_cleanup_spec()
        with session_scope() as s:
            n = s.execute(
                text(
                    """
                    DELETE FROM utah_poi
                    WHERE poi_type = ANY(:types)
                      AND ST_DWithin(
                        geom::geography,
                        ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                        :radius_m
                      )
                    """
                ),
                {
                    "types": list(spec.delete_poi_types),
                    "lat": rc.anchor_lat,
                    "lng": rc.anchor_lng,
                    "radius_m": rc.radius_mi * 1609.34,
                },
            ).rowcount
            typer.echo(f"  deleted {n} noise rows")
        typer.echo("[stage] consolidate (post-cleanup)")
        consolidate(distance_m=300.0, name_threshold=78)

    typer.echo("[stage] enrich-master")
    from utah_engine import master_enrichment as me
    me.link_reddit_signals()
    me.derive_activity_tags()
    me.compute_crowdedness()
    me.resolve_thumbnails()
    me.compute_sun_ephemeris()
    me.compute_nearby()
    me.compute_derived_gems()
    if not skip_vision:
        me.enrich_with_vision(only_min_sources=3)

    typer.echo(f"[done] {rc.key}")


if __name__ == "__main__":
    sys.exit(app())
