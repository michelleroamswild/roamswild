"""Tiny FastAPI inspection page for the Moab pilot DB.

One route (``/``) renders a self-contained HTML dashboard so we can
eyeball pipeline output without wiring up a real frontend yet.
"""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Query
from fastapi.responses import HTMLResponse
from sqlalchemy import text

from utah_engine.config import settings
from utah_engine.db import session_scope

app = FastAPI(title="RoamsWild Moab Pilot — Inspection")


def _q(sql: str, **params: Any) -> list[dict[str, Any]]:
    with session_scope() as s:
        rows = s.execute(text(sql), params).mappings().all()
        return [dict(r) for r in rows]


@app.get("/", response_class=HTMLResponse)
def home() -> str:
    counts = _q(
        """
        SELECT
          (SELECT count(*) FROM utah_poi WHERE source = 'ugrc')   AS ugrc_trails,
          (SELECT count(*) FROM utah_poi WHERE source != 'ugrc')  AS promoted_pois,
          (SELECT count(*) FROM pilot_regions)                    AS regions,
          (SELECT count(*) FROM snippets)                         AS snippets,
          (SELECT count(*) FROM snippets WHERE enriched_at IS NOT NULL) AS enriched,
          (SELECT count(*) FROM snippets WHERE matched_poi_id IS NOT NULL) AS matched,
          (SELECT count(*) FROM snippets WHERE enrichment ? 'match_ambiguous') AS ambiguous,
          (SELECT count(*) FROM snippets WHERE promoted_poi_id IS NOT NULL)    AS promoted,
          (SELECT count(*) FROM snippets WHERE skipped_reason IS NOT NULL)     AS skipped,
          (SELECT count(*) FROM utah_poi WHERE metadata_tags ? 'community_signals') AS pois_with_signals,
          (SELECT count(*) FROM poi_region) AS poi_region_links
        """,
    )[0]

    matches = _q(
        """
        SELECT s.id, s.name AS snippet, s.source, s.source_url,
               p.name AS matched_to, p.poi_type,
               s.enrichment->>'summary' AS summary,
               s.enrichment->'mentioned_places' AS mentions,
               s.enrichment->>'difficulty_rating' AS difficulty,
               s.enrichment->>'scenic_score' AS scenic_score,
               s.enrichment->'vehicle_requirements' AS vehicle,
               s.enrichment->'danger_tags' AS dangers
        FROM snippets s JOIN utah_poi p ON p.id = s.matched_poi_id
        ORDER BY s.updated_at DESC
        """
    )

    ambiguous = _q(
        """
        SELECT s.name AS snippet, s.source, s.source_url,
               jsonb_array_length(s.enrichment->'match_ambiguous') AS n_candidates,
               s.enrichment->'match_ambiguous' AS candidates,
               s.enrichment->>'summary' AS summary,
               s.enrichment->'mentioned_places' AS mentions
        FROM snippets s
        WHERE s.enrichment ? 'match_ambiguous'
        ORDER BY n_candidates DESC
        LIMIT 30
        """
    )

    promoted = _q(
        """
        SELECT poi.name, poi.poi_type, poi.is_hidden_gem,
               poi.metadata_tags->>'summary' AS summary,
               poi.metadata_tags->>'placement_via' AS placed_via,
               poi.metadata_tags->>'scenic_score' AS scenic_score,
               poi.metadata_tags->'danger_tags' AS dangers,
               poi.metadata_tags->'vehicle_requirements' AS vehicle,
               poi.source, poi.source_url
        FROM utah_poi poi
        WHERE poi.source != 'ugrc'
        ORDER BY poi.created_at DESC
        """
    )

    regions = _q(
        """
        SELECT r.name, r.region_type,
               ROUND((ST_Area(r.bounds::geography)/2589988.11)::numeric, 1) AS sq_mi,
               (SELECT count(*) FROM poi_region pr WHERE pr.region_id = r.id) AS poi_count
        FROM pilot_regions r
        ORDER BY poi_count DESC
        """
    )

    enriched_sample = _q(
        """
        SELECT s.name AS snippet, s.source, s.source_url,
               s.enrichment->>'poi_type' AS poi_type,
               s.enrichment->>'summary' AS summary,
               s.enrichment->>'difficulty_rating' AS difficulty,
               s.enrichment->>'scenic_score' AS scenic_score,
               s.enrichment->'best_time' AS best_time,
               s.enrichment->'vehicle_requirements' AS vehicle,
               s.enrichment->'danger_tags' AS dangers,
               s.enrichment->'mentioned_places' AS mentions,
               s.matched_poi_id IS NOT NULL AS matched,
               s.enrichment ? 'match_ambiguous' AS ambiguous,
               s.promoted_poi_id IS NOT NULL AS promoted
        FROM snippets s
        WHERE s.enriched_at IS NOT NULL
        ORDER BY s.enriched_at DESC
        LIMIT 50
        """
    )

    return _render(counts, matches, ambiguous, promoted, regions, enriched_sample)


# ---------------------------------------------------------------------------
# Rendering — plain HTML/CSS, no template engine to keep the pilot lean.
# ---------------------------------------------------------------------------


def _render(
    counts: dict[str, Any],
    matches: list[dict[str, Any]],
    ambiguous: list[dict[str, Any]],
    promoted: list[dict[str, Any]],
    regions: list[dict[str, Any]],
    enriched_sample: list[dict[str, Any]],
) -> str:
    head = f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Moab Pilot · Inspection</title>
<style>
  :root {{
    --bg: #f7f3ec; --paper: #fff; --line: #e3dccc;
    --ink: #1d2218; --ink-2: #4a4d3f; --ink-3: #7a7d6e;
    --pine: #2c4530; --water: #2c5871; --clay: #b56839; --sage: #6b7f4d; --cream: #faf6ed;
  }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }}
  header {{ padding: 24px 32px; border-bottom: 1px solid var(--line); background: var(--paper); }}
  header h1 {{ margin: 0; font-size: 22px; letter-spacing: -0.02em; }}
  header .sub {{ color: var(--ink-3); font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 4px; }}
  main {{ max-width: 1280px; margin: 0 auto; padding: 24px 32px 80px; }}
  section {{ background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 20px 24px; margin-bottom: 24px; }}
  section h2 {{ margin: 0 0 14px; font-size: 16px; letter-spacing: -0.01em; }}
  section .hint {{ color: var(--ink-3); font-size: 12px; margin-bottom: 14px; }}
  .counts {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }}
  .count {{ padding: 14px 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--cream); }}
  .count .v {{ font-size: 22px; font-weight: 700; }}
  .count .l {{ color: var(--ink-3); font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 2px; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
  th, td {{ text-align: left; padding: 10px 12px; vertical-align: top; }}
  th {{ background: var(--cream); border-bottom: 1px solid var(--line); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-2); }}
  tbody tr {{ border-bottom: 1px solid var(--line); }}
  tbody tr:last-child {{ border-bottom: 0; }}
  td.snippet {{ max-width: 340px; }}
  td.summary {{ max-width: 380px; color: var(--ink-2); }}
  td.list {{ font-size: 12px; color: var(--ink-2); }}
  a {{ color: var(--water); text-decoration: none; }}
  a:hover {{ text-decoration: underline; }}
  .pill {{ display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }}
  .pill.trail {{ background: rgba(107, 127, 77, 0.18); color: var(--sage); }}
  .pill.gem {{ background: rgba(181, 104, 57, 0.18); color: var(--clay); }}
  .pill.region {{ background: rgba(44, 88, 113, 0.16); color: var(--water); }}
  .pill.match {{ background: rgba(44, 69, 48, 0.18); color: var(--pine); }}
  .pill.amb {{ background: rgba(181, 104, 57, 0.16); color: var(--clay); }}
  .small {{ font-size: 11px; color: var(--ink-3); }}
  .candidates {{ font-family: ui-monospace, monospace; font-size: 11px; color: var(--ink-3); }}
</style></head><body>
<header>
  <h1>RoamsWild Moab Pilot · Inspection</h1>
  <div class="sub">{settings.moab_lat}, {settings.moab_lng} · radius {settings.radius_mi} mi · model {settings.anthropic_model}</div>
</header>
<main>
"""

    # ------- Counts -----------------------------------------------------
    counts_html = '<section><h2>Overview</h2><div class="counts">'
    for label, value in counts.items():
        counts_html += f'<div class="count"><div class="v">{value}</div><div class="l">{label.replace("_", " ")}</div></div>'
    counts_html += "</div></section>"

    # ------- Strict matches --------------------------------------------
    matches_rows = "".join(
        f"""
        <tr>
          <td class="snippet"><strong>{_h(m['matched_to'])}</strong> <span class="pill trail">{_h(m['poi_type'] or '')}</span><br>
            <a href="{_h(m['source_url'])}" target="_blank">{_h(m['snippet'])}</a><br>
            <span class="small">{_h(m['source'])}</span>
          </td>
          <td class="summary">{_h(m['summary'] or '')}</td>
          <td class="list">{_render_list(m.get('mentions') or [])}</td>
          <td class="list">{_h(m['difficulty'] or '—')} / scenic {_h(m['scenic_score'] or '—')}<br>{_render_list(m.get('vehicle') or [])}<br>{_render_list(m.get('dangers') or [])}</td>
        </tr>"""
        for m in matches
    )
    matches_html = f"""
<section>
  <h2>Strict matches <span class="pill match">{len(matches)}</span></h2>
  <div class="hint">Each snippet linked to one UGRC trail. Score &ge; 88, distinctive token overlap required.</div>
  <table>
    <thead><tr><th>UGRC trail / source</th><th>LLM summary</th><th>Mentioned places</th><th>Difficulty / vehicle / dangers</th></tr></thead>
    <tbody>{matches_rows or '<tr><td colspan="4" class="small">No strict matches yet.</td></tr>'}</tbody>
  </table>
</section>
"""

    # ------- Ambiguous --------------------------------------------------
    ambig_rows = "".join(
        f"""
        <tr>
          <td class="snippet"><a href="{_h(a['source_url'])}" target="_blank">{_h(a['snippet'])}</a><br><span class="small">{_h(a['source'])}</span></td>
          <td class="summary">{_h(a['summary'] or '')}</td>
          <td class="list">{_render_list(a.get('mentions') or [])}</td>
          <td><span class="pill amb">{a['n_candidates']}</span> <span class="candidates">{_h(', '.join((c.get('name') or '') for c in (a.get('candidates') or [])[:5]))}{'…' if a['n_candidates'] > 5 else ''}</span></td>
        </tr>"""
        for a in ambiguous
    )
    ambig_html = f"""
<section>
  <h2>Ambiguous matches <span class="pill amb">{len(ambiguous)}</span></h2>
  <div class="hint">Snippet's mentioned place fuzzy-matches multiple UGRC segments (e.g. "Slickrock" appears 5×). Real Moab content; needs a tiebreaker.</div>
  <table>
    <thead><tr><th>Snippet</th><th>LLM summary</th><th>Mentioned places</th><th>Top UGRC candidates</th></tr></thead>
    <tbody>{ambig_rows or '<tr><td colspan="4" class="small">None.</td></tr>'}</tbody>
  </table>
</section>
"""

    # ------- Promoted POIs ----------------------------------------------
    promoted_rows = "".join(
        f"""
        <tr>
          <td><strong>{_h(p['name'])}</strong> <span class="pill trail">{_h(p['poi_type'] or '')}</span> {('<span class="pill gem">hidden gem</span>' if p.get('is_hidden_gem') else '')}<br><span class="small">{_h(p['source'])} · {_h(p.get('placed_via') or '')}</span></td>
          <td class="summary">{_h(p['summary'] or '')}</td>
          <td class="list">scenic {_h(p['scenic_score'] or '—')}<br>{_render_list(p.get('vehicle') or [])}<br>{_render_list(p.get('dangers') or [])}</td>
          <td><a href="{_h(p['source_url'])}" target="_blank">source</a></td>
        </tr>"""
        for p in promoted
    )
    promoted_html = f"""
<section>
  <h2>Promoted community POIs <span class="pill gem">{len(promoted)}</span></h2>
  <div class="hint">Snippets that didn't match a UGRC trail but were placeable via region centroid.</div>
  <table>
    <thead><tr><th>POI / placement</th><th>Summary</th><th>Tags</th><th>Source</th></tr></thead>
    <tbody>{promoted_rows or '<tr><td colspan="4" class="small">No promoted POIs yet.</td></tr>'}</tbody>
  </table>
</section>
"""

    # ------- Regions ----------------------------------------------------
    region_rows = "".join(
        f"""
        <tr>
          <td><strong>{_h(r['name'])}</strong> <span class="pill region">{_h(r['region_type'] or '')}</span></td>
          <td>{r.get('sq_mi') or '—'} sq mi</td>
          <td>{r['poi_count']}</td>
        </tr>"""
        for r in regions
    )
    region_html = f"""
<section>
  <h2>Regions <span class="pill region">{len(regions)}</span></h2>
  <table>
    <thead><tr><th>Region</th><th>Area</th><th>POIs inside</th></tr></thead>
    <tbody>{region_rows}</tbody>
  </table>
</section>
"""

    # ------- Enriched sample --------------------------------------------
    sample_rows = "".join(
        f"""
        <tr>
          <td class="snippet"><a href="{_h(s['source_url'])}" target="_blank">{_h(s['snippet'])}</a><br><span class="small">{_h(s['source'])}</span></td>
          <td>{_h(s['poi_type'] or '')}</td>
          <td class="summary">{_h(s['summary'] or '')}</td>
          <td class="list">scenic {_h(s['scenic_score'] or '—')}<br>{_h(s['difficulty'] or '')}<br>{_render_list(s.get('best_time') or [])}</td>
          <td class="list">{_render_list(s.get('mentions') or [])}</td>
          <td>{('<span class="pill match">match</span>' if s.get('matched') else '')}{('<span class="pill amb">amb</span>' if s.get('ambiguous') else '')}{('<span class="pill gem">promoted</span>' if s.get('promoted') else '')}</td>
        </tr>"""
        for s in enriched_sample
    )
    sample_html = f"""
<section>
  <h2>Recent enriched snippets <span class="pill match">{len(enriched_sample)}</span></h2>
  <div class="hint">A scrollable look at how Claude is reading the raw Reddit posts.</div>
  <table>
    <thead><tr><th>Snippet</th><th>Type</th><th>Summary</th><th>Scoring</th><th>Mentioned places</th><th>State</th></tr></thead>
    <tbody>{sample_rows}</tbody>
  </table>
</section>
"""

    return head + counts_html + matches_html + ambig_html + promoted_html + region_html + sample_html + "</main></body></html>"


@app.get("/trails", response_class=HTMLResponse)
def trails(
    q: str = Query("", description="Name search."),
    use: str = Query("", description="Filter by primary_use."),
    region: str = Query("", description="Filter by region name."),
    surface: str = Query("", description="Filter by SurfaceType."),
    page: int = Query(1, ge=1),
) -> str:
    """Paginated raw view of UGRC trails. No enrichment — just the data."""
    page_size = 50
    offset = (page - 1) * page_size

    where = ["poi.source = 'ugrc'"]
    params: dict[str, Any] = {"limit": page_size, "offset": offset}
    if q:
        where.append("poi.name ILIKE :q")
        params["q"] = f"%{q}%"
    if use:
        where.append("poi.primary_use = :use")
        params["use"] = use
    if surface:
        where.append("poi.metadata_tags->>'ugrc_surface' = :surface")
        params["surface"] = surface
    if region:
        where.append(
            "EXISTS (SELECT 1 FROM poi_region pr "
            "JOIN pilot_regions r ON r.id = pr.region_id "
            "WHERE pr.poi_id = poi.id AND r.name = :region)"
        )
        params["region"] = region

    where_clause = " AND ".join(where)

    rows = _q(
        f"""
        SELECT poi.id::text AS id,
               poi.name,
               poi.primary_use,
               poi.metadata_tags->>'ugrc_status' AS status,
               poi.metadata_tags->>'ugrc_surface' AS surface,
               poi.metadata_tags->>'ugrc_difficulty_hike' AS hike_diff,
               poi.metadata_tags->>'ugrc_difficulty_bike' AS bike_diff,
               poi.metadata_tags->'ugrc_attributes'->>'County' AS county,
               poi.metadata_tags->'ugrc_attributes'->>'OwnerSteward' AS owner,
               poi.metadata_tags->'ugrc_attributes'->>'RecreationArea' AS rec_area,
               (SELECT string_agg(r.name, ', ') FROM poi_region pr
                  JOIN pilot_regions r ON r.id = pr.region_id
                  WHERE pr.poi_id = poi.id) AS regions,
               ST_Y(geom) AS lat,
               ST_X(geom) AS lng
        FROM utah_poi poi
        WHERE {where_clause}
        ORDER BY poi.name
        LIMIT :limit OFFSET :offset
        """,
        **params,
    )

    total_row = _q(
        f"SELECT count(*) AS n FROM utah_poi poi WHERE {where_clause}",
        **{k: v for k, v in params.items() if k not in ("limit", "offset")},
    )
    total = total_row[0]["n"] if total_row else 0
    pages = max(1, (total + page_size - 1) // page_size)

    use_buckets = _q(
        "SELECT primary_use, count(*) AS n FROM utah_poi WHERE source = 'ugrc' "
        "GROUP BY primary_use ORDER BY n DESC"
    )
    surface_buckets = _q(
        "SELECT metadata_tags->>'ugrc_surface' AS surface, count(*) AS n FROM utah_poi "
        "WHERE source = 'ugrc' GROUP BY 1 ORDER BY n DESC"
    )
    region_buckets = _q(
        """
        SELECT r.name, count(*) AS n
        FROM pilot_regions r
        LEFT JOIN poi_region pr ON pr.region_id = r.id
        LEFT JOIN utah_poi poi ON poi.id = pr.poi_id AND poi.source = 'ugrc'
        GROUP BY r.name ORDER BY n DESC
        """
    )

    return _render_trails(
        rows=rows,
        total=total,
        page=page,
        pages=pages,
        q=q,
        use=use,
        region=region,
        surface=surface,
        use_buckets=use_buckets,
        surface_buckets=surface_buckets,
        region_buckets=region_buckets,
    )


def _render_trails(
    *,
    rows: list[dict[str, Any]],
    total: int,
    page: int,
    pages: int,
    q: str,
    use: str,
    region: str,
    surface: str,
    use_buckets: list[dict[str, Any]],
    surface_buckets: list[dict[str, Any]],
    region_buckets: list[dict[str, Any]],
) -> str:
    head = f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Moab Pilot · Trails</title>
<style>
  :root {{
    --bg: #f7f3ec; --paper: #fff; --line: #e3dccc;
    --ink: #1d2218; --ink-2: #4a4d3f; --ink-3: #7a7d6e;
    --pine: #2c4530; --water: #2c5871; --clay: #b56839; --sage: #6b7f4d; --cream: #faf6ed;
  }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; background: var(--bg); color: var(--ink);
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }}
  header {{ padding: 20px 32px; background: var(--paper); border-bottom: 1px solid var(--line); }}
  header h1 {{ margin: 0; font-size: 22px; letter-spacing: -0.02em; }}
  header .sub {{ color: var(--ink-3); font-size: 12px; text-transform: uppercase;
    letter-spacing: 0.1em; margin-top: 4px; }}
  nav {{ margin-top: 12px; display: flex; gap: 16px; }}
  nav a {{ color: var(--ink-2); font-weight: 600; text-decoration: none; padding: 4px 0; border-bottom: 2px solid transparent; }}
  nav a.active {{ color: var(--pine); border-color: var(--pine); }}
  main {{ display: grid; grid-template-columns: 280px 1fr; gap: 20px; max-width: 1480px; margin: 0 auto; padding: 20px 32px 80px; }}
  aside {{ background: var(--paper); border: 1px solid var(--line); border-radius: 12px;
    padding: 16px 18px; height: fit-content; position: sticky; top: 20px; }}
  aside h3 {{ margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--ink-3); font-weight: 600; }}
  aside .group {{ margin-bottom: 18px; }}
  aside form input[type=text] {{ width: 100%; padding: 6px 10px; border: 1px solid var(--line);
    border-radius: 8px; font: inherit; }}
  aside form button {{ margin-top: 8px; padding: 6px 12px; background: var(--pine); color: var(--cream);
    border: 0; border-radius: 999px; font: 600 12px/1 inherit; letter-spacing: 0.04em; cursor: pointer; }}
  .filter {{ display: block; padding: 4px 0; color: var(--ink-2); text-decoration: none; font-size: 13px; }}
  .filter:hover {{ color: var(--pine); }}
  .filter.active {{ color: var(--pine); font-weight: 600; }}
  .filter .n {{ color: var(--ink-3); font-size: 11px; margin-left: 4px; }}
  .reset {{ display: inline-block; margin-top: 6px; font-size: 12px; color: var(--clay); text-decoration: none; }}
  section.results {{ background: var(--paper); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }}
  .summary-bar {{ padding: 14px 20px; border-bottom: 1px solid var(--line); display: flex;
    align-items: center; justify-content: space-between; }}
  .summary-bar .count {{ font-weight: 600; }}
  .summary-bar .pages a {{ display: inline-block; padding: 4px 10px; margin: 0 2px; border: 1px solid var(--line);
    border-radius: 999px; color: var(--ink-2); text-decoration: none; font-size: 12px; }}
  .summary-bar .pages a.active {{ background: var(--pine); color: var(--cream); border-color: var(--pine); }}
  table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
  th, td {{ text-align: left; padding: 9px 14px; vertical-align: top; }}
  th {{ background: var(--cream); border-bottom: 1px solid var(--line); font-weight: 600;
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-2); }}
  tbody tr {{ border-bottom: 1px solid var(--line); }}
  tbody tr:last-child {{ border-bottom: 0; }}
  td.name {{ font-weight: 600; max-width: 280px; }}
  td.regions {{ color: var(--ink-3); font-size: 12px; max-width: 220px; }}
  td.coord {{ font-family: ui-monospace, monospace; font-size: 11px; color: var(--ink-3); }}
  .pill {{ display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px;
    font-weight: 600; letter-spacing: 0.04em; }}
  .pill.use {{ background: rgba(107, 127, 77, 0.18); color: var(--sage); }}
  .pill.surface {{ background: rgba(44, 88, 113, 0.16); color: var(--water); }}
  .pill.status {{ background: rgba(74, 77, 63, 0.16); color: var(--ink-2); }}
  .pill.diff {{ background: rgba(181, 104, 57, 0.18); color: var(--clay); }}
</style></head><body>
<header>
  <h1>Moab Pilot · Raw Trails</h1>
  <div class="sub">{settings.moab_lat}, {settings.moab_lng} · radius {settings.radius_mi} mi · UGRC TrailsAndPathways</div>
  <nav>
    <a href="/">Inspection</a>
    <a href="/trails" class="active">Trails</a>
  </nav>
</header>
<main>
"""

    # Sidebar filters
    sidebar = '<aside>'
    sidebar += f"""
    <div class="group">
      <h3>Search name</h3>
      <form method="get">
        <input type="text" name="q" value="{_h(q)}" placeholder="slickrock, hells…">
        <input type="hidden" name="use" value="{_h(use)}">
        <input type="hidden" name="region" value="{_h(region)}">
        <input type="hidden" name="surface" value="{_h(surface)}">
        <button type="submit">Filter</button>
        <a href="/trails" class="reset">reset all</a>
      </form>
    </div>
    """

    sidebar += '<div class="group"><h3>Primary use</h3>'
    sidebar += f'<a class="filter{ " active" if not use else ""}" href="{_query_link("", region=region, surface=surface, q=q)}">All <span class="n">{sum(b["n"] for b in use_buckets)}</span></a>'
    for b in use_buckets:
        active = " active" if b["primary_use"] == use else ""
        label = b["primary_use"] or "(unspecified)"
        sidebar += f'<a class="filter{active}" href="{_query_link(b["primary_use"] or "", region=region, surface=surface, q=q)}">{_h(label)} <span class="n">{b["n"]}</span></a>'
    sidebar += "</div>"

    sidebar += '<div class="group"><h3>Region</h3>'
    sidebar += f'<a class="filter{ " active" if not region else ""}" href="{_query_link(use=use, region="", surface=surface, q=q)}">All</a>'
    for b in region_buckets:
        active = " active" if b["name"] == region else ""
        sidebar += f'<a class="filter{active}" href="{_query_link(use=use, region=b["name"], surface=surface, q=q)}">{_h(b["name"])} <span class="n">{b["n"]}</span></a>'
    sidebar += "</div>"

    sidebar += '<div class="group"><h3>Surface</h3>'
    sidebar += f'<a class="filter{ " active" if not surface else ""}" href="{_query_link(use=use, region=region, surface="", q=q)}">All</a>'
    for b in surface_buckets:
        active = " active" if b["surface"] == surface else ""
        label = b["surface"] or "(unspecified)"
        sidebar += f'<a class="filter{active}" href="{_query_link(use=use, region=region, surface=b["surface"] or "", q=q)}">{_h(label)} <span class="n">{b["n"]}</span></a>'
    sidebar += "</div>"

    sidebar += "</aside>"

    # Pagination links
    page_links = ""
    for p in range(max(1, page - 4), min(pages, page + 4) + 1):
        active = " active" if p == page else ""
        page_links += f'<a class="{active.strip()}" href="{_query_link(use=use, region=region, surface=surface, q=q, page=p)}">{p}</a>'
    if pages > page + 4:
        page_links += f' <a href="{_query_link(use=use, region=region, surface=surface, q=q, page=pages)}">last ({pages})</a>'

    # Table
    rows_html = "".join(
        f"""
        <tr>
          <td class="name">{_h(r['name'])}<br><span class="small" style="color:var(--ink-3); font-size:11px;">{_h(r.get('rec_area') or '')}</span></td>
          <td><span class="pill use">{_h(r['primary_use'] or '—')}</span></td>
          <td><span class="pill surface">{_h(r['surface'] or '—')}</span></td>
          <td><span class="pill status">{_h(r['status'] or '—')}</span></td>
          <td>{_pill_or_dash(r.get('hike_diff'))}{_pill_or_dash(r.get('bike_diff'))}</td>
          <td class="regions">{_h(r.get('regions') or '—')}</td>
          <td>{_h(r.get('county') or '—')}</td>
          <td class="coord">{_fmt_coord(r['lat'], r['lng'])}</td>
        </tr>"""
        for r in rows
    )

    table_html = f"""
<section class="results">
  <div class="summary-bar">
    <div class="count">{total} trails {('· filtered' if (q or use or region or surface) else '')}</div>
    <div class="pages">{page_links}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Name / area</th><th>Use</th><th>Surface</th><th>Status</th>
        <th>Difficulty</th><th>Region</th><th>County</th><th>Centroid</th>
      </tr>
    </thead>
    <tbody>{rows_html or '<tr><td colspan="8">No trails match.</td></tr>'}</tbody>
  </table>
</section>
"""

    return head + sidebar + table_html + "</main></body></html>"


def _query_link(use: str = "", *, region: str = "", surface: str = "", q: str = "", page: int = 1) -> str:
    """Build a /trails?... link preserving filters. Empty values omitted."""
    parts: list[str] = []
    for k, v in (("q", q), ("use", use), ("region", region), ("surface", surface)):
        if v:
            parts.append(f"{k}={_url(v)}")
    if page > 1:
        parts.append(f"page={page}")
    qs = ("?" + "&".join(parts)) if parts else ""
    return f"/trails{qs}"


def _url(s: str) -> str:
    from urllib.parse import quote
    return quote(s, safe="")


def _pill_or_dash(v: Any) -> str:
    if not v:
        return ""
    return f'<span class="pill diff">{_h(v)}</span> '


def _fmt_coord(lat: Any, lng: Any) -> str:
    try:
        return f"{float(lat):.4f}, {float(lng):.4f}"
    except Exception:
        return "—"


@app.get("/places", response_class=HTMLResponse)
def places(
    q: str = Query("", description="Name search."),
    poi_type: str = Query("", description="Filter by poi_type."),
    region: str = Query("", description="Filter by region name."),
    page: int = Query(1, ge=1),
) -> str:
    """Paginated raw view of named POIs (GNIS + others, excluding UGRC trails)."""
    page_size = 50
    offset = (page - 1) * page_size

    where = ["poi.source != 'ugrc'"]
    params: dict[str, Any] = {"limit": page_size, "offset": offset}
    if q:
        where.append("poi.name ILIKE :q")
        params["q"] = f"%{q}%"
    if poi_type:
        where.append("poi.poi_type = :poi_type")
        params["poi_type"] = poi_type
    if region:
        where.append(
            "EXISTS (SELECT 1 FROM poi_region pr "
            "JOIN pilot_regions r ON r.id = pr.region_id "
            "WHERE pr.poi_id = poi.id AND r.name = :region)"
        )
        params["region"] = region

    where_clause = " AND ".join(where)

    rows = _q(
        f"""
        SELECT poi.id::text AS id,
               poi.name,
               poi.poi_type,
               poi.source,
               poi.is_hidden_gem,
               poi.metadata_tags->>'gnis_county' AS county,
               poi.metadata_tags->>'gnis_feature_class' AS gnis_class,
               poi.metadata_tags->>'summary' AS summary,
               poi.metadata_tags->'cross_ref'->>'matched_source' AS xref_source,
               poi.metadata_tags->'cross_ref'->>'matched_name'   AS xref_name,
               (poi.metadata_tags->'cross_ref'->>'distance_m')::float AS xref_dist,
               (poi.metadata_tags->'cross_ref'->>'name_score')::int   AS xref_score,
               poi.elevation_ft,
               (SELECT string_agg(r.name, ', ') FROM poi_region pr
                  JOIN pilot_regions r ON r.id = pr.region_id
                  WHERE pr.poi_id = poi.id) AS regions,
               ST_Y(geom) AS lat,
               ST_X(geom) AS lng
        FROM utah_poi poi
        WHERE {where_clause}
        ORDER BY (poi.metadata_tags ? 'cross_ref') DESC, poi.name
        LIMIT :limit OFFSET :offset
        """,
        **params,
    )

    total_row = _q(
        f"SELECT count(*) AS n FROM utah_poi poi WHERE {where_clause}",
        **{k: v for k, v in params.items() if k not in ("limit", "offset")},
    )
    total = total_row[0]["n"] if total_row else 0
    pages = max(1, (total + page_size - 1) // page_size)

    type_buckets = _q(
        "SELECT poi_type, count(*) AS n FROM utah_poi WHERE source != 'ugrc' "
        "GROUP BY poi_type ORDER BY n DESC"
    )
    region_buckets = _q(
        """
        SELECT r.name, count(*) AS n
        FROM pilot_regions r
        LEFT JOIN poi_region pr ON pr.region_id = r.id
        LEFT JOIN utah_poi poi ON poi.id = pr.poi_id AND poi.source != 'ugrc'
        GROUP BY r.name ORDER BY n DESC
        """
    )
    source_buckets = _q(
        "SELECT source, count(*) AS n FROM utah_poi WHERE source != 'ugrc' "
        "GROUP BY source ORDER BY n DESC"
    )

    return _render_places(
        rows=rows,
        total=total,
        page=page,
        pages=pages,
        q=q,
        poi_type=poi_type,
        region=region,
        type_buckets=type_buckets,
        region_buckets=region_buckets,
        source_buckets=source_buckets,
    )


def _render_places(
    *,
    rows: list[dict[str, Any]],
    total: int,
    page: int,
    pages: int,
    q: str,
    poi_type: str,
    region: str,
    type_buckets: list[dict[str, Any]],
    region_buckets: list[dict[str, Any]],
    source_buckets: list[dict[str, Any]],
) -> str:
    head = f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Moab Pilot · Places</title>
<style>
  :root {{
    --bg: #f7f3ec; --paper: #fff; --line: #e3dccc;
    --ink: #1d2218; --ink-2: #4a4d3f; --ink-3: #7a7d6e;
    --pine: #2c4530; --water: #2c5871; --clay: #b56839; --sage: #6b7f4d; --cream: #faf6ed;
  }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; background: var(--bg); color: var(--ink);
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }}
  header {{ padding: 20px 32px; background: var(--paper); border-bottom: 1px solid var(--line); }}
  header h1 {{ margin: 0; font-size: 22px; letter-spacing: -0.02em; }}
  header .sub {{ color: var(--ink-3); font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 4px; }}
  nav {{ margin-top: 12px; display: flex; gap: 16px; }}
  nav a {{ color: var(--ink-2); font-weight: 600; text-decoration: none; padding: 4px 0; border-bottom: 2px solid transparent; }}
  nav a.active {{ color: var(--pine); border-color: var(--pine); }}
  main {{ display: grid; grid-template-columns: 280px 1fr; gap: 20px; max-width: 1480px; margin: 0 auto; padding: 20px 32px 80px; }}
  aside {{ background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px; height: fit-content; position: sticky; top: 20px; }}
  aside h3 {{ margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-3); font-weight: 600; }}
  aside .group {{ margin-bottom: 18px; }}
  aside form input[type=text] {{ width: 100%; padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px; font: inherit; }}
  aside form button {{ margin-top: 8px; padding: 6px 12px; background: var(--pine); color: var(--cream); border: 0; border-radius: 999px; font: 600 12px/1 inherit; letter-spacing: 0.04em; cursor: pointer; }}
  .filter {{ display: block; padding: 4px 0; color: var(--ink-2); text-decoration: none; font-size: 13px; }}
  .filter:hover {{ color: var(--pine); }}
  .filter.active {{ color: var(--pine); font-weight: 600; }}
  .filter .n {{ color: var(--ink-3); font-size: 11px; margin-left: 4px; }}
  .reset {{ display: inline-block; margin-top: 6px; font-size: 12px; color: var(--clay); text-decoration: none; }}
  section.results {{ background: var(--paper); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }}
  .summary-bar {{ padding: 14px 20px; border-bottom: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; }}
  .summary-bar .count {{ font-weight: 600; }}
  .summary-bar .pages a {{ display: inline-block; padding: 4px 10px; margin: 0 2px; border: 1px solid var(--line); border-radius: 999px; color: var(--ink-2); text-decoration: none; font-size: 12px; }}
  .summary-bar .pages a.active {{ background: var(--pine); color: var(--cream); border-color: var(--pine); }}
  table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
  th, td {{ text-align: left; padding: 9px 14px; vertical-align: top; }}
  th {{ background: var(--cream); border-bottom: 1px solid var(--line); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-2); }}
  tbody tr {{ border-bottom: 1px solid var(--line); }}
  tbody tr:last-child {{ border-bottom: 0; }}
  td.name {{ font-weight: 600; max-width: 280px; }}
  td.regions {{ color: var(--ink-3); font-size: 12px; max-width: 220px; }}
  td.coord {{ font-family: ui-monospace, monospace; font-size: 11px; color: var(--ink-3); }}
  .pill {{ display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; }}
  .pill.type {{ background: rgba(107, 127, 77, 0.18); color: var(--sage); }}
  .pill.gem {{ background: rgba(181, 104, 57, 0.18); color: var(--clay); }}
  .pill.source {{ background: rgba(44, 88, 113, 0.16); color: var(--water); }}
  .pill.xref {{ background: rgba(44, 69, 48, 0.18); color: var(--pine); }}
  .xref-detail {{ font-size: 11px; color: var(--ink-3); margin-top: 2px; }}
</style></head><body>
<header>
  <h1>Moab Pilot · Places</h1>
  <div class="sub">{settings.moab_lat}, {settings.moab_lng} · radius {settings.radius_mi} mi · GNIS named natural features</div>
  <nav>
    <a href="/">Inspection</a>
    <a href="/trails">Trails</a>
    <a href="/places" class="active">Places</a>
  </nav>
</header>
<main>
"""

    sidebar = '<aside>'
    sidebar += f"""
    <div class="group">
      <h3>Search name</h3>
      <form method="get">
        <input type="text" name="q" value="{_h(q)}" placeholder="delicate, mesa, geyser…">
        <input type="hidden" name="poi_type" value="{_h(poi_type)}">
        <input type="hidden" name="region" value="{_h(region)}">
        <button type="submit">Filter</button>
        <a href="/places" class="reset">reset all</a>
      </form>
    </div>
    """

    sidebar += '<div class="group"><h3>Type</h3>'
    sidebar += f'<a class="filter{ " active" if not poi_type else ""}" href="{_places_link(region=region, q=q)}">All <span class="n">{sum(b["n"] for b in type_buckets)}</span></a>'
    for b in type_buckets:
        active = " active" if b["poi_type"] == poi_type else ""
        sidebar += f'<a class="filter{active}" href="{_places_link(poi_type=b["poi_type"] or "", region=region, q=q)}">{_h(b["poi_type"] or "(unknown)")} <span class="n">{b["n"]}</span></a>'
    sidebar += "</div>"

    sidebar += '<div class="group"><h3>Region</h3>'
    sidebar += f'<a class="filter{ " active" if not region else ""}" href="{_places_link(poi_type=poi_type, q=q)}">All</a>'
    for b in region_buckets:
        active = " active" if b["name"] == region else ""
        sidebar += f'<a class="filter{active}" href="{_places_link(poi_type=poi_type, region=b["name"], q=q)}">{_h(b["name"])} <span class="n">{b["n"]}</span></a>'
    sidebar += "</div>"

    sidebar += '<div class="group"><h3>Source</h3>'
    for b in source_buckets:
        sidebar += f'<div class="filter">{_h(b["source"])} <span class="n">{b["n"]}</span></div>'
    sidebar += "</div>"

    sidebar += "</aside>"

    page_links = ""
    for p in range(max(1, page - 4), min(pages, page + 4) + 1):
        active = " active" if p == page else ""
        page_links += f'<a class="{active.strip()}" href="{_places_link(poi_type=poi_type, region=region, q=q, page=p)}">{p}</a>'
    if pages > page + 4:
        page_links += f' <a href="{_places_link(poi_type=poi_type, region=region, q=q, page=pages)}">last ({pages})</a>'

    rows_html = "".join(
        f"""
        <tr>
          <td class="name">{_h(r['name'])}{' <span class="pill gem">gem</span>' if r.get('is_hidden_gem') else ''}<br>
            <span style="color:var(--ink-3); font-size:11px;">{_h(r.get('gnis_class') or '')}</span>
          </td>
          <td><span class="pill type">{_h(r['poi_type'] or '—')}</span></td>
          <td>
            <span class="pill source">{_h(r['source'])}</span>
            {('<span class="pill xref">✓ both</span>' if r.get('xref_source') else '')}
            {(f'<div class="xref-detail">→ {_h(r["xref_name"])} ({_h(r["xref_source"])} · {r.get("xref_dist", "?")}m · {r.get("xref_score", "?")}%)</div>' if r.get('xref_source') else '')}
          </td>
          <td class="regions">{_h(r.get('regions') or '—')}</td>
          <td>{_h(r.get('county') or '—')}</td>
          <td>{_h(r.get('elevation_ft') or '—')}</td>
          <td class="coord">{_fmt_coord(r['lat'], r['lng'])}</td>
        </tr>"""
        for r in rows
    )

    table_html = f"""
<section class="results">
  <div class="summary-bar">
    <div class="count">{total} places {('· filtered' if (q or poi_type or region) else '')}</div>
    <div class="pages">{page_links}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Name</th><th>Type</th><th>Source</th>
        <th>Region</th><th>County</th><th>Elev (ft)</th><th>Coord</th>
      </tr>
    </thead>
    <tbody>{rows_html or '<tr><td colspan="7">No places match.</td></tr>'}</tbody>
  </table>
</section>
"""

    return head + sidebar + table_html + "</main></body></html>"


def _places_link(*, poi_type: str = "", region: str = "", q: str = "", page: int = 1) -> str:
    parts: list[str] = []
    for k, v in (("q", q), ("poi_type", poi_type), ("region", region)):
        if v:
            parts.append(f"{k}={_url(v)}")
    if page > 1:
        parts.append(f"page={page}")
    qs = ("?" + "&".join(parts)) if parts else ""
    return f"/places{qs}"


def _h(value: Any) -> str:
    if value is None:
        return ""
    s = str(value)
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _render_list(items: list[Any] | None) -> str:
    if not items:
        return ""
    parts = [_h(str(i)) for i in items if i is not None]
    return ", ".join(parts) or ""
