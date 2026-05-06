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

    return head + counts_html + matches_html + ambig_html + promoted_html + region_html + sample_html + "</main>" + _SIDEBAR_SCROLL_JS + "</body></html>"


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
  aside h3 {{ margin: 0 0 10px; font-size: 14px; letter-spacing: -0.005em; color: var(--ink); font-weight: 700; }}
  aside .group {{ margin-bottom: 22px; }}
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
          <td class="coord"><a href="https://www.google.com/maps?q={r['lat']},{r['lng']}" target="_blank" rel="noopener">{_fmt_coord(r['lat'], r['lng'])}</a></td>
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

    return head + sidebar + table_html + "</main>" + _SIDEBAR_SCROLL_JS + "</body></html>"


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


@app.get("/master", response_class=HTMLResponse)
def master(
    q: str = Query(""),
    poi_type: str = Query(""),
    region: str = Query(""),
    contains_source: str = Query(""),
    min_sources: int = Query(0),
    min_photos: int = Query(0),
    only_hidden_gem: str = Query(""),
    only_locationscout: str = Query(""),
    crowdedness: str = Query(""),
    activity: str = Query(""),
    only_derived_gem: str = Query(""),
    page: int = Query(1, ge=1),
) -> str:
    page_size = 50
    offset = (page - 1) * page_size

    where = ["1=1"]
    params: dict[str, Any] = {"limit": page_size, "offset": offset}
    if q:
        where.append("m.canonical_name ILIKE :q")
        params["q"] = f"%{q}%"
    if poi_type:
        where.append("m.poi_type = :poi_type")
        params["poi_type"] = poi_type
    if contains_source:
        where.append("m.sources ? :contains_source")
        params["contains_source"] = contains_source
    if min_sources > 0:
        where.append("m.source_count >= :min_sources")
        params["min_sources"] = min_sources
    if min_photos > 0:
        where.append("m.photo_count >= :min_photos")
        params["min_photos"] = min_photos
    if only_hidden_gem == "1":
        where.append("m.is_hidden_gem = TRUE")
    if only_locationscout == "1":
        where.append("m.locationscout_endorsed = TRUE")
    if crowdedness in ("low", "moderate", "high"):
        where.append("m.metadata_tags->>'crowdedness' = :crowdedness")
        params["crowdedness"] = crowdedness
    if activity:
        where.append("m.metadata_tags->'activity_tags' ? :activity")
        params["activity"] = activity
    if only_derived_gem == "1":
        where.append("(m.metadata_tags->>'derived_gem')::boolean IS TRUE")
    if region:
        where.append(
            "EXISTS (SELECT 1 FROM pilot_regions r "
            "WHERE r.name = :region AND ST_Contains(r.bounds, m.geom))"
        )
        params["region"] = region

    where_clause = " AND ".join(where)

    rows = _q(
        f"""
        SELECT m.id::text AS id,
               m.canonical_name AS name,
               m.poi_type,
               m.source_count,
               m.sources,
               m.is_hidden_gem,
               m.photo_count,
               m.locationscout_endorsed,
               m.metadata_tags->>'summary' AS summary,
               m.metadata_tags->'vision'->>'description' AS vision_description,
               m.metadata_tags->'vision'->'best_time_of_day' AS best_time_of_day,
               m.metadata_tags->'vision'->>'effort_to_reach' AS effort,
               m.metadata_tags->>'crowdedness' AS crowdedness_score,
               m.metadata_tags->'thumbnail'->>'thumb_url' AS thumb_url,
               m.metadata_tags->'thumbnail'->>'credit' AS thumb_credit,
               m.metadata_tags->'activity_tags' AS activity_tags,
               (m.metadata_tags->>'derived_gem')::boolean AS derived_gem,
               (SELECT string_agg(r.name, ', ') FROM pilot_regions r
                  WHERE ST_Contains(r.bounds, m.geom)) AS regions,
               ST_Y(m.geom) AS lat,
               ST_X(m.geom) AS lng
        FROM master_places m
        WHERE {where_clause}
        ORDER BY m.source_count DESC, m.photo_count DESC, m.canonical_name
        LIMIT :limit OFFSET :offset
        """,
        **params,
    )

    total_row = _q(
        f"SELECT count(*) AS n FROM master_places m WHERE {where_clause}",
        **{k: v for k, v in params.items() if k not in ("limit", "offset")},
    )
    total = total_row[0]["n"] if total_row else 0
    pages = max(1, (total + page_size - 1) // page_size)

    type_buckets = _q(
        "SELECT poi_type, count(*) AS n FROM master_places GROUP BY poi_type ORDER BY n DESC"
    )
    region_buckets = _q(
        """
        SELECT r.name, count(*) AS n
        FROM pilot_regions r
        LEFT JOIN master_places m ON ST_Contains(r.bounds, m.geom)
        GROUP BY r.name ORDER BY n DESC
        """
    )
    source_buckets = _q(
        """
        SELECT src AS source, count(*) AS n
        FROM master_places m, jsonb_array_elements_text(m.sources) src
        GROUP BY src ORDER BY n DESC
        """
    )
    overview = _q(
        """
        SELECT
          (SELECT count(*) FROM master_places)                                            AS total,
          (SELECT count(*) FROM master_places WHERE source_count >= 2)                    AS multi_source,
          (SELECT count(*) FROM master_places WHERE source_count >= 3)                    AS three_plus,
          (SELECT count(*) FROM master_places WHERE photo_count >= 5)                     AS photo_5plus,
          (SELECT count(*) FROM master_places WHERE photo_count >= 20)                    AS photo_20plus,
          (SELECT count(*) FROM master_places WHERE is_hidden_gem)                        AS hidden_gem,
          (SELECT count(*) FROM master_places WHERE locationscout_endorsed)               AS locationscout,
          (SELECT count(*) FROM master_places WHERE metadata_tags ? 'vision')             AS with_vision,
          (SELECT count(*) FROM master_places WHERE metadata_tags->'thumbnail'->>'thumb_url' IS NOT NULL) AS with_thumbnail,
          (SELECT count(*) FROM master_places WHERE metadata_tags->>'crowdedness' = 'low')  AS crowd_low,
          (SELECT count(*) FROM master_places WHERE metadata_tags->>'crowdedness' = 'moderate') AS crowd_moderate,
          (SELECT count(*) FROM master_places WHERE metadata_tags->>'crowdedness' = 'high') AS crowd_high,
          (SELECT count(*) FROM master_places WHERE (metadata_tags->>'derived_gem')::boolean) AS derived_gem
        """
    )[0]

    activity_buckets = _q(
        """
        SELECT activity AS tag, count(*) AS n
        FROM master_places m, jsonb_array_elements_text(m.metadata_tags->'activity_tags') activity
        GROUP BY activity ORDER BY n DESC LIMIT 20
        """
    )

    return _render_master(
        rows=rows, total=total, page=page, pages=pages,
        q=q, poi_type=poi_type, region=region, contains_source=contains_source,
        min_sources=min_sources, min_photos=min_photos,
        only_hidden_gem=only_hidden_gem, only_locationscout=only_locationscout,
        crowdedness=crowdedness, activity=activity,
        only_derived_gem=only_derived_gem,
        type_buckets=type_buckets, region_buckets=region_buckets,
        source_buckets=source_buckets, activity_buckets=activity_buckets,
        overview=overview,
    )


def _render_master(
    *,
    rows: list[dict[str, Any]],
    total: int,
    page: int,
    pages: int,
    q: str,
    poi_type: str,
    region: str,
    contains_source: str,
    min_sources: int,
    min_photos: int,
    only_hidden_gem: str,
    only_locationscout: str,
    crowdedness: str,
    activity: str,
    only_derived_gem: str,
    type_buckets: list[dict[str, Any]],
    region_buckets: list[dict[str, Any]],
    source_buckets: list[dict[str, Any]],
    activity_buckets: list[dict[str, Any]],
    overview: dict[str, Any],
) -> str:
    head = f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Moab Pilot · Master Places</title>
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
  aside {{ background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 18px 20px; height: fit-content; position: sticky; top: 20px; max-height: calc(100vh - 40px); overflow-y: auto; }}
  aside h3 {{ margin: 0 0 10px; font-size: 14px; letter-spacing: -0.005em; color: var(--ink); font-weight: 700; }}
  aside .group {{ margin-bottom: 22px; }}
  aside form input[type=text] {{ width: 100%; padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px; font: inherit; }}
  aside form button {{ margin-top: 8px; padding: 6px 12px; background: var(--pine); color: var(--cream); border: 0; border-radius: 999px; font: 600 12px/1 inherit; letter-spacing: 0.04em; cursor: pointer; }}
  .filter {{ display: block; padding: 4px 0; color: var(--ink-2); text-decoration: none; font-size: 13px; }}
  .filter:hover {{ color: var(--pine); }}
  .filter.active {{ color: var(--pine); font-weight: 600; }}
  .filter .n {{ color: var(--ink-3); font-size: 11px; margin-left: 4px; }}
  .reset {{ display: inline-block; margin-top: 6px; font-size: 12px; color: var(--clay); text-decoration: none; }}
  section.results {{ background: var(--paper); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }}
  .summary-bar {{ padding: 14px 20px; border-bottom: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }}
  .summary-bar .count {{ font-weight: 600; }}
  .summary-bar .pages a {{ display: inline-block; padding: 4px 10px; margin: 0 2px; border: 1px solid var(--line); border-radius: 999px; color: var(--ink-2); text-decoration: none; font-size: 12px; }}
  .summary-bar .pages a.active {{ background: var(--pine); color: var(--cream); border-color: var(--pine); }}
  .overview {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; padding: 16px 20px; background: var(--cream); border-bottom: 1px solid var(--line); }}
  .stat {{ font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-3); }}
  .stat .v {{ font-size: 18px; font-weight: 700; color: var(--ink); display: block; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
  th, td {{ text-align: left; padding: 9px 14px; vertical-align: top; }}
  th {{ background: var(--cream); border-bottom: 1px solid var(--line); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-2); }}
  tbody tr {{ border-bottom: 1px solid var(--line); }}
  tbody tr:last-child {{ border-bottom: 0; }}
  td.name {{ font-weight: 600; max-width: 280px; }}
  td.regions {{ color: var(--ink-3); font-size: 12px; max-width: 200px; }}
  td.coord {{ font-family: ui-monospace, monospace; font-size: 11px; color: var(--ink-3); }}
  .pill {{ display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; margin-right: 4px; margin-bottom: 2px; }}
  .pill.type {{ background: rgba(107, 127, 77, 0.18); color: var(--sage); }}
  .pill.gem {{ background: rgba(181, 104, 57, 0.18); color: var(--clay); }}
  .pill.source {{ background: rgba(44, 88, 113, 0.16); color: var(--water); font-size: 10px; font-weight: 500; }}
  .pill.count {{ background: rgba(44, 69, 48, 0.18); color: var(--pine); }}
  .pill.photo {{ background: rgba(181, 104, 57, 0.20); color: var(--clay); }}
  .pill.ls {{ background: rgba(74, 77, 63, 0.16); color: var(--ink-2); }}
  .pill.activity {{ background: rgba(107, 127, 77, 0.10); color: var(--sage); font-size: 10px; font-weight: 500; }}
  .pill.crowd-low {{ background: rgba(107, 127, 77, 0.18); color: var(--sage); }}
  .active-strip {{ margin: 0 0 22px; padding: 10px 12px; background: var(--cream); border: 1px solid var(--line); border-radius: 10px; }}
  .active-strip h3 {{ margin: 0 0 8px !important; font-size: 12px !important; font-weight: 700; }}
  .active-chip {{ display: inline-flex; align-items: center; gap: 4px; margin: 2px 4px 2px 0; padding: 3px 8px; background: var(--paper); color: var(--ink); border: 1px solid var(--line); border-radius: 999px; font-size: 11px; text-decoration: none; }}
  .active-chip:hover {{ border-color: var(--clay); color: var(--clay); }}
  .active-chip .lab {{ color: var(--ink-3); font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; margin-right: 2px; }}
  .active-chip .x {{ color: var(--ink-3); font-weight: 700; margin-left: 2px; }}
  .clear-all {{ display: inline-block; margin-top: 6px; font-size: 11px; color: var(--clay); text-decoration: none; }}
  .pill.crowd-moderate {{ background: rgba(181, 104, 57, 0.18); color: var(--clay); }}
  .pill.crowd-high {{ background: rgba(181, 104, 57, 0.30); color: var(--clay); }}
  .pill.effort {{ background: rgba(44, 88, 113, 0.16); color: var(--water); }}
  .pill.time {{ background: rgba(74, 77, 63, 0.10); color: var(--ink-2); font-size: 10px; }}
  .thumb {{ width: 100px; height: 80px; object-fit: cover; border-radius: 8px; border: 1px solid var(--line); }}
  .thumb-cell {{ width: 110px; }}
  .description {{ color: var(--ink-2); font-size: 12px; margin-top: 6px; line-height: 1.45; }}
  .pill-row {{ margin-top: 6px; line-height: 1.8; }}
</style></head><body>
<header>
  <h1>Moab Pilot · Master Places</h1>
  <div class="sub">{settings.moab_lat}, {settings.moab_lng} · radius {settings.radius_mi} mi · deduplicated, multi-source-tagged</div>
  <nav>
    <a href="/">Inspection</a>
    <a href="/trails">Trails</a>
    <a href="/places">Raw Places</a>
    <a href="/master" class="active">Master</a>
  </nav>
</header>
<main>
"""

    sidebar = '<aside>'

    def _link(**kw: Any) -> str:
        merged = dict(
            q=q, poi_type=poi_type, region=region, contains_source=contains_source,
            min_sources=min_sources, min_photos=min_photos,
            only_hidden_gem=only_hidden_gem, only_locationscout=only_locationscout,
            crowdedness=crowdedness, activity=activity,
            only_derived_gem=only_derived_gem,
        )
        merged.update(kw)
        parts: list[str] = []
        for k, v in merged.items():
            if k == "page":
                if v and v > 1: parts.append(f"page={v}")
            elif isinstance(v, int):
                if v > 0: parts.append(f"{k}={v}")
            elif v:
                parts.append(f"{k}={_url(str(v))}")
        return "/master" + (("?" + "&".join(parts)) if parts else "")

    # Active-filter chips at the top
    active_chips: list[tuple[str, str, str]] = []  # (label, value, link_to_remove)
    if q:
        active_chips.append(("Search", q, _link(q="")))
    if poi_type:
        active_chips.append(("Type", _pretty(poi_type), _link(poi_type="")))
    if region:
        active_chips.append(("Region", region, _link(region="")))
    if contains_source:
        active_chips.append(("Source", _pretty(contains_source), _link(contains_source="")))
    if min_sources > 0:
        active_chips.append(("Sources", f"{min_sources}+", _link(min_sources=0)))
    if min_photos > 0:
        active_chips.append(("Photos", f"{min_photos}+", _link(min_photos=0)))
    if only_hidden_gem == "1":
        active_chips.append(("Endorsement", "Curator gem", _link(only_hidden_gem="")))
    if only_locationscout == "1":
        active_chips.append(("Endorsement", "Locationscout", _link(only_locationscout="")))
    if only_derived_gem == "1":
        active_chips.append(("Endorsement", "Derived gem", _link(only_derived_gem="")))
    if crowdedness:
        active_chips.append(("Crowd", crowdedness.title(), _link(crowdedness="")))
    if activity:
        active_chips.append(("Activity", _pretty(activity), _link(activity="")))

    if active_chips:
        chips_html = "".join(
            f'<a class="active-chip" href="{href}" title="Remove">'
            f'<span class="lab">{_h(lab)}</span>{_h(val)}<span class="x">×</span></a>'
            for lab, val, href in active_chips
        )
        sidebar += (
            '<div class="active-strip">'
            f'<h3>Active filters ({len(active_chips)})</h3>'
            f'{chips_html}'
            '<br><a class="clear-all" href="/master">Clear all</a>'
            '</div>'
        )

    sidebar += f"""
    <div class="group">
      <h3>Search name</h3>
      <form method="get">
        <input type="text" name="q" value="{_h(q)}" placeholder="mesa, slickrock, geyser…">
        <input type="hidden" name="poi_type" value="{_h(poi_type)}">
        <input type="hidden" name="region" value="{_h(region)}">
        <input type="hidden" name="contains_source" value="{_h(contains_source)}">
        <input type="hidden" name="min_sources" value="{min_sources}">
        <input type="hidden" name="min_photos" value="{min_photos}">
        <input type="hidden" name="only_hidden_gem" value="{_h(only_hidden_gem)}">
        <input type="hidden" name="only_locationscout" value="{_h(only_locationscout)}">
        <input type="hidden" name="crowdedness" value="{_h(crowdedness)}">
        <input type="hidden" name="activity" value="{_h(activity)}">
        <input type="hidden" name="only_derived_gem" value="{_h(only_derived_gem)}">
        <button type="submit">Filter</button>
      </form>
    </div>
    """

    # Cross-source filter: # of sources
    sidebar += '<div class="group"><h3>Sources confirming</h3>'
    sidebar += f'<a class="filter{ " active" if min_sources == 0 else ""}" href="{_link(min_sources=0)}">Any</a>'
    sidebar += f'<a class="filter{ " active" if min_sources == 2 else ""}" href="{_link(min_sources=2)}">2+ sources <span class="n">{overview.get("multi_source")}</span></a>'
    sidebar += f'<a class="filter{ " active" if min_sources == 3 else ""}" href="{_link(min_sources=3)}">3+ sources <span class="n">{overview.get("three_plus")}</span></a>'
    sidebar += "</div>"

    # Source membership filter (which sources are present)
    sidebar += '<div class="group"><h3>Includes source</h3>'
    sidebar += f'<a class="filter{ " active" if not contains_source else ""}" href="{_link(contains_source="")}">Any</a>'
    for b in source_buckets:
        active = " active" if b["source"] == contains_source else ""
        sidebar += f'<a class="filter{active}" href="{_link(contains_source=b["source"])}">{_h(_pretty(b["source"]))} <span class="n">{b["n"]}</span></a>'
    sidebar += "</div>"

    # Photographed
    sidebar += '<div class="group"><h3>Photographed</h3>'
    sidebar += f'<a class="filter{ " active" if min_photos == 0 else ""}" href="{_link(min_photos=0)}">Any</a>'
    sidebar += f'<a class="filter{ " active" if min_photos == 5 else ""}" href="{_link(min_photos=5)}">5+ photos <span class="n">{overview.get("photo_5plus")}</span></a>'
    sidebar += f'<a class="filter{ " active" if min_photos == 20 else ""}" href="{_link(min_photos=20)}">20+ photos <span class="n">{overview.get("photo_20plus")}</span></a>'
    sidebar += "</div>"

    # Endorsements
    sidebar += '<div class="group"><h3>Endorsements</h3>'
    sidebar += f'<a class="filter{ " active" if only_hidden_gem == "1" else ""}" href="{_link(only_hidden_gem="1" if only_hidden_gem != "1" else "")}">Hidden-gem flag <span class="n">{overview.get("hidden_gem")}</span></a>'
    sidebar += f'<a class="filter{ " active" if only_locationscout == "1" else ""}" href="{_link(only_locationscout="1" if only_locationscout != "1" else "")}">Locationscout endorsed <span class="n">{overview.get("locationscout")}</span></a>'
    sidebar += f'<a class="filter{ " active" if only_derived_gem == "1" else ""}" href="{_link(only_derived_gem="1" if only_derived_gem != "1" else "")}">Likely hidden gem (derived) <span class="n">{overview.get("derived_gem")}</span></a>'
    sidebar += "</div>"

    # Crowdedness
    sidebar += '<div class="group"><h3>Crowdedness</h3>'
    sidebar += f'<a class="filter{ " active" if not crowdedness else ""}" href="{_link(crowdedness="")}">Any</a>'
    for level, count_key in (("low", "crowd_low"), ("moderate", "crowd_moderate"), ("high", "crowd_high")):
        active = " active" if crowdedness == level else ""
        sidebar += f'<a class="filter{active}" href="{_link(crowdedness=level)}">{level.title()} <span class="n">{overview.get(count_key)}</span></a>'
    sidebar += "</div>"

    # Activity
    sidebar += '<div class="group"><h3>Activity</h3>'
    sidebar += f'<a class="filter{ " active" if not activity else ""}" href="{_link(activity="")}">Any</a>'
    for b in activity_buckets[:14]:
        active = " active" if b["tag"] == activity else ""
        sidebar += f'<a class="filter{active}" href="{_link(activity=b["tag"])}">{_h(_pretty(b["tag"]))} <span class="n">{b["n"]}</span></a>'
    sidebar += "</div>"

    # Type
    sidebar += '<div class="group"><h3>Type</h3>'
    sidebar += f'<a class="filter{ " active" if not poi_type else ""}" href="{_link(poi_type="")}">All <span class="n">{overview.get("total")}</span></a>'
    for b in type_buckets:
        active = " active" if b["poi_type"] == poi_type else ""
        sidebar += f'<a class="filter{active}" href="{_link(poi_type=b["poi_type"] or "")}">{_h(_pretty(b["poi_type"]) or "(unknown)")} <span class="n">{b["n"]}</span></a>'
    sidebar += "</div>"

    # Region
    sidebar += '<div class="group"><h3>Region</h3>'
    sidebar += f'<a class="filter{ " active" if not region else ""}" href="{_link(region="")}">All</a>'
    for b in region_buckets:
        if b["n"] == 0: continue
        active = " active" if b["name"] == region else ""
        sidebar += f'<a class="filter{active}" href="{_link(region=b["name"])}">{_h(b["name"])} <span class="n">{b["n"]}</span></a>'
    sidebar += "</div>"
    sidebar += "</aside>"

    # Pagination
    page_links = ""
    for p in range(max(1, page - 4), min(pages, page + 4) + 1):
        active = " active" if p == page else ""
        page_links += f'<a class="{active.strip()}" href="{_link(page=p)}">{p}</a>'
    if pages > page + 4:
        page_links += f' <a href="{_link(page=pages)}">last ({pages})</a>'

    overview_html = f"""
<div class="overview">
  <div class="stat"><span class="v">{overview.get('total')}</span>master places</div>
  <div class="stat"><span class="v">{overview.get('multi_source')}</span>2+ sources</div>
  <div class="stat"><span class="v">{overview.get('three_plus')}</span>3+ sources</div>
  <div class="stat"><span class="v">{overview.get('photo_5plus')}</span>5+ photos</div>
  <div class="stat"><span class="v">{overview.get('photo_20plus')}</span>20+ photos</div>
  <div class="stat"><span class="v">{overview.get('hidden_gem')}</span>hidden gems</div>
  <div class="stat"><span class="v">{overview.get('locationscout')}</span>locationscout</div>
  <div class="stat"><span class="v">{overview.get('with_thumbnail')}</span>with photo</div>
  <div class="stat"><span class="v">{overview.get('with_vision')}</span>vision-enriched</div>
</div>
"""

    rows_html = ""
    for r in rows:
        srcs = r.get("sources") or []
        src_pills = "".join(f'<span class="pill source">{_h(_pretty(s))}</span>' for s in srcs)
        photo_pill = f'<span class="pill photo">📷 {r["photo_count"]}</span>' if r.get("photo_count") else ""
        gem_pill = '<span class="pill gem">curator gem</span>' if r.get("is_hidden_gem") else ''
        derived_gem_pill = '<span class="pill gem">derived gem</span>' if r.get("derived_gem") else ''
        ls_pill = '<span class="pill ls">📸 LS</span>' if r.get("locationscout_endorsed") else ''
        crowd = r.get("crowdedness_score") or ""
        crowd_pill = f'<span class="pill crowd-{crowd}">Crowd: {crowd.title()}</span>' if crowd else ''
        effort = r.get("effort") or ""
        effort_pill = f'<span class="pill effort">{_pretty(effort)}</span>' if effort else ''
        best_times = r.get("best_time_of_day") or []
        time_pills = "".join(f'<span class="pill time">{_h(_pretty(t))}</span>' for t in best_times)
        activity_tags = r.get("activity_tags") or []
        activity_pills = "".join(f'<span class="pill activity">{_h(_pretty(t))}</span>' for t in activity_tags[:8])
        description = (r.get("vision_description") or r.get("summary") or "")[:280]
        thumb_url = r.get("thumb_url")
        thumb_cell = (
            f'<td class="thumb-cell"><img class="thumb" src="{_h(thumb_url)}" alt=""></td>'
            if thumb_url
            else '<td class="thumb-cell"></td>'
        )

        rows_html += f"""
        <tr>
          {thumb_cell}
          <td class="name">{_h(r['name'])} {gem_pill}{derived_gem_pill}{ls_pill}{photo_pill}
            {('<div class="description">' + _h(description) + '</div>') if description else ''}
            <div class="pill-row">
              <span class="pill type">{_h(_pretty(r['poi_type']) or '—')}</span>
              {effort_pill}{crowd_pill}{time_pills}
            </div>
            <div class="pill-row">{activity_pills}</div>
          </td>
          <td><span class="pill count">{r['source_count']}×</span><br>{src_pills}</td>
          <td class="regions">{_h(r.get('regions') or '—')}</td>
          <td class="coord"><a href="https://www.google.com/maps?q={r['lat']},{r['lng']}" target="_blank" rel="noopener">{_fmt_coord(r['lat'], r['lng'])}</a></td>
        </tr>"""

    table_html = f"""
<section class="results">
  {overview_html}
  <div class="summary-bar">
    <div class="count">{total} of {overview.get('total')} master places{('  ·  filtered') if (q or poi_type or region or contains_source or min_sources or min_photos or only_hidden_gem or only_locationscout or crowdedness or activity) else ''}</div>
    <div class="pages">{page_links}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th></th><th>Place</th><th>Sources</th><th>Region</th><th>Centroid</th>
      </tr>
    </thead>
    <tbody>{rows_html or '<tr><td colspan="5">No master places match this filter.</td></tr>'}</tbody>
  </table>
</section>
"""

    return head + sidebar + table_html + "</main>" + _SIDEBAR_SCROLL_JS + "</body></html>"


@app.get("/places", response_class=HTMLResponse)
def places(
    q: str = Query("", description="Name search."),
    poi_type: str = Query("", description="Filter by poi_type."),
    region: str = Query("", description="Filter by region name."),
    source: str = Query("", description="Filter by source."),
    cross_ref: str = Query("", description="'1' to show only rows confirmed by another source."),
    endorsed_by: str = Query("", description="Filter by endorsement (e.g. 'locationscout', 'hidden_gem')."),
    min_photos: int = Query(0, description="Min Wikimedia Commons photo count within 300m."),
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
    if source:
        where.append("poi.source = :source")
        params["source"] = source
    if cross_ref == "1":
        where.append(
            "(poi.metadata_tags ? 'cross_refs' "
            "OR poi.metadata_tags ? 'cross_ref')"
        )
    if endorsed_by == "locationscout":
        where.append("poi.metadata_tags ? 'locationscout'")
    elif endorsed_by == "hidden_gem":
        where.append("poi.is_hidden_gem = TRUE")
    if min_photos > 0:
        where.append("(poi.metadata_tags->'wikimedia'->>'photo_count')::int >= :min_photos")
        params["min_photos"] = min_photos

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
               COALESCE(
                 poi.metadata_tags->'cross_refs',
                 CASE WHEN poi.metadata_tags ? 'cross_ref'
                      THEN jsonb_build_array(poi.metadata_tags->'cross_ref')
                      ELSE '[]'::jsonb END
               ) AS xrefs,
               (poi.metadata_tags->'wikimedia'->>'photo_count')::int AS photo_count,
               poi.elevation_ft,
               (SELECT string_agg(r.name, ', ') FROM poi_region pr
                  JOIN pilot_regions r ON r.id = pr.region_id
                  WHERE pr.poi_id = poi.id) AS regions,
               ST_Y(geom) AS lat,
               ST_X(geom) AS lng
        FROM utah_poi poi
        WHERE {where_clause}
        ORDER BY
          COALESCE((poi.metadata_tags->'wikimedia'->>'photo_count')::int, 0) DESC,
          (poi.metadata_tags ? 'cross_refs' OR poi.metadata_tags ? 'cross_ref') DESC,
          poi.name
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

    endorsement_counts = _q(
        """
        SELECT
          (SELECT count(*) FROM utah_poi
            WHERE source != 'ugrc' AND metadata_tags ? 'locationscout')   AS locationscout,
          (SELECT count(*) FROM utah_poi
            WHERE source != 'ugrc' AND is_hidden_gem)                     AS hidden_gem,
          (SELECT count(*) FROM snippets
            WHERE source = 'locationscout' AND promoted_poi_id IS NULL)   AS locationscout_orphans,
          (SELECT count(*) FROM utah_poi
            WHERE source != 'ugrc' AND metadata_tags ? 'wikimedia')       AS with_photos,
          (SELECT count(*) FROM utah_poi
            WHERE source != 'ugrc'
              AND (metadata_tags->'wikimedia'->>'photo_count')::int >= 5) AS with_5plus,
          (SELECT count(*) FROM utah_poi
            WHERE source != 'ugrc'
              AND (metadata_tags->'wikimedia'->>'photo_count')::int >= 20) AS with_20plus
        """
    )[0]

    return _render_places(
        rows=rows,
        total=total,
        page=page,
        pages=pages,
        q=q,
        poi_type=poi_type,
        region=region,
        source=source,
        cross_ref=cross_ref,
        endorsed_by=endorsed_by,
        min_photos=min_photos,
        type_buckets=type_buckets,
        region_buckets=region_buckets,
        source_buckets=source_buckets,
        endorsement_counts=endorsement_counts,
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
    source: str,
    cross_ref: str,
    endorsed_by: str,
    min_photos: int,
    type_buckets: list[dict[str, Any]],
    region_buckets: list[dict[str, Any]],
    source_buckets: list[dict[str, Any]],
    endorsement_counts: dict[str, Any],
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
  aside h3 {{ margin: 0 0 10px; font-size: 14px; letter-spacing: -0.005em; color: var(--ink); font-weight: 700; }}
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
  .pill.photo {{ background: rgba(181, 104, 57, 0.20); color: var(--clay); }}
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
        <input type="hidden" name="source" value="{_h(source)}">
        <input type="hidden" name="cross_ref" value="{_h(cross_ref)}">
        <button type="submit">Filter</button>
        <a href="/places" class="reset">reset all</a>
      </form>
    </div>
    """

    sidebar += '<div class="group"><h3>Cross-source confirmation</h3>'
    sidebar += f'<a class="filter{ " active" if cross_ref != "1" else ""}" href="{_places_link(poi_type=poi_type, region=region, source=source, endorsed_by=endorsed_by, min_photos=min_photos, q=q)}">All places</a>'
    sidebar += f'<a class="filter{ " active" if cross_ref == "1" else ""}" href="{_places_link(poi_type=poi_type, region=region, source=source, endorsed_by=endorsed_by, min_photos=min_photos, q=q, cross_ref="1")}">Confirmed by another source</a>'
    sidebar += "</div>"

    sidebar += '<div class="group"><h3>Photographed</h3>'
    sidebar += f'<a class="filter{ " active" if min_photos == 0 else ""}" href="{_places_link(poi_type=poi_type, region=region, source=source, q=q, cross_ref=cross_ref, endorsed_by=endorsed_by)}">Any</a>'
    sidebar += f'<a class="filter{ " active" if min_photos == 1 else ""}" href="{_places_link(poi_type=poi_type, region=region, source=source, q=q, cross_ref=cross_ref, endorsed_by=endorsed_by, min_photos=1)}">Has Wikimedia photos <span class="n">{endorsement_counts.get("with_photos") or 0}</span></a>'
    sidebar += f'<a class="filter{ " active" if min_photos == 5 else ""}" href="{_places_link(poi_type=poi_type, region=region, source=source, q=q, cross_ref=cross_ref, endorsed_by=endorsed_by, min_photos=5)}">5+ photos <span class="n">{endorsement_counts.get("with_5plus") or 0}</span></a>'
    sidebar += f'<a class="filter{ " active" if min_photos == 20 else ""}" href="{_places_link(poi_type=poi_type, region=region, source=source, q=q, cross_ref=cross_ref, endorsed_by=endorsed_by, min_photos=20)}">20+ photos (very popular) <span class="n">{endorsement_counts.get("with_20plus") or 0}</span></a>'
    sidebar += "</div>"

    sidebar += '<div class="group"><h3>Endorsements</h3>'
    sidebar += f'<a class="filter{ " active" if not endorsed_by else ""}" href="{_places_link(poi_type=poi_type, region=region, source=source, q=q, cross_ref=cross_ref, min_photos=min_photos)}">Any</a>'
    sidebar += f'<a class="filter{ " active" if endorsed_by == "locationscout" else ""}" href="{_places_link(poi_type=poi_type, region=region, source=source, q=q, cross_ref=cross_ref, endorsed_by="locationscout", min_photos=min_photos)}">Locationscout endorsed <span class="n">{endorsement_counts.get("locationscout") or 0}</span></a>'
    sidebar += f'<a class="filter{ " active" if endorsed_by == "hidden_gem" else ""}" href="{_places_link(poi_type=poi_type, region=region, source=source, q=q, cross_ref=cross_ref, endorsed_by="hidden_gem", min_photos=min_photos)}">Hidden-gem flag <span class="n">{endorsement_counts.get("hidden_gem") or 0}</span></a>'
    orphans = endorsement_counts.get("locationscout_orphans") or 0
    if orphans:
        sidebar += (
            f'<div class="filter" style="font-size:11px;color:var(--ink-3);margin-top:6px">'
            f'+{orphans} locationscout listings without coords (in snippets — not on this page)</div>'
        )
    sidebar += "</div>"

    sidebar += '<div class="group"><h3>Source</h3>'
    sidebar += f'<a class="filter{ " active" if not source else ""}" href="{_places_link(poi_type=poi_type, region=region, q=q, cross_ref=cross_ref, endorsed_by=endorsed_by, min_photos=min_photos)}">All <span class="n">{sum(b["n"] for b in source_buckets)}</span></a>'
    for b in source_buckets:
        active = " active" if b["source"] == source else ""
        sidebar += f'<a class="filter{active}" href="{_places_link(poi_type=poi_type, region=region, source=b["source"], q=q, cross_ref=cross_ref, endorsed_by=endorsed_by, min_photos=min_photos)}">{_h(_pretty(b["source"]))} <span class="n">{b["n"]}</span></a>'
    sidebar += "</div>"

    sidebar += '<div class="group"><h3>Type</h3>'
    sidebar += f'<a class="filter{ " active" if not poi_type else ""}" href="{_places_link(region=region, source=source, q=q, cross_ref=cross_ref, endorsed_by=endorsed_by, min_photos=min_photos)}">All <span class="n">{sum(b["n"] for b in type_buckets)}</span></a>'
    for b in type_buckets:
        active = " active" if b["poi_type"] == poi_type else ""
        sidebar += f'<a class="filter{active}" href="{_places_link(poi_type=b["poi_type"] or "", region=region, source=source, q=q, cross_ref=cross_ref, endorsed_by=endorsed_by, min_photos=min_photos)}">{_h(_pretty(b["poi_type"]) or "(unknown)")} <span class="n">{b["n"]}</span></a>'
    sidebar += "</div>"

    sidebar += '<div class="group"><h3>Region</h3>'
    sidebar += f'<a class="filter{ " active" if not region else ""}" href="{_places_link(poi_type=poi_type, source=source, q=q, cross_ref=cross_ref, endorsed_by=endorsed_by, min_photos=min_photos)}">All</a>'
    for b in region_buckets:
        active = " active" if b["name"] == region else ""
        sidebar += f'<a class="filter{active}" href="{_places_link(poi_type=poi_type, region=b["name"], source=source, q=q, cross_ref=cross_ref, endorsed_by=endorsed_by, min_photos=min_photos)}">{_h(b["name"])} <span class="n">{b["n"]}</span></a>'
    sidebar += "</div>"

    sidebar += "</aside>"

    page_links = ""
    for p in range(max(1, page - 4), min(pages, page + 4) + 1):
        active = " active" if p == page else ""
        page_links += f'<a class="{active.strip()}" href="{_places_link(poi_type=poi_type, region=region, source=source, q=q, cross_ref=cross_ref, endorsed_by=endorsed_by, min_photos=min_photos, page=p)}">{p}</a>'
    if pages > page + 4:
        page_links += f' <a href="{_places_link(poi_type=poi_type, region=region, source=source, q=q, cross_ref=cross_ref, endorsed_by=endorsed_by, min_photos=min_photos, page=pages)}">last ({pages})</a>'

    def _xref_html(refs: list[dict[str, Any]] | None) -> str:
        if not refs:
            return ""
        n = len(refs)
        label = "✓ all 3 sources" if n >= 2 else f"✓ {refs[0].get('matched_source')}"
        details = "<br>".join(
            f"→ {_h(ref.get('matched_name'))} ({_h(ref.get('matched_source'))} · "
            f"{ref.get('distance_m', '?')}m · {ref.get('name_score', '?')}%)"
            for ref in refs
        )
        return f'<span class="pill xref">{label}</span><div class="xref-detail">{details}</div>'

    rows_html = "".join(
        f"""
        <tr>
          <td class="name">{_h(r['name'])}{' <span class="pill gem">gem</span>' if r.get('is_hidden_gem') else ''}{f' <span class="pill photo">📷 {r["photo_count"]}</span>' if r.get('photo_count') else ''}<br>
            <span style="color:var(--ink-3); font-size:11px;">{_h(r.get('gnis_class') or '')}</span>
          </td>
          <td><span class="pill type">{_h(_pretty(r['poi_type']) or '—')}</span></td>
          <td>
            <span class="pill source">{_h(r['source'])}</span>
            {_xref_html(r.get('xrefs'))}
          </td>
          <td class="regions">{_h(r.get('regions') or '—')}</td>
          <td>{_h(r.get('county') or '—')}</td>
          <td>{_h(r.get('elevation_ft') or '—')}</td>
          <td class="coord"><a href="https://www.google.com/maps?q={r['lat']},{r['lng']}" target="_blank" rel="noopener">{_fmt_coord(r['lat'], r['lng'])}</a></td>
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

    return head + sidebar + table_html + "</main>" + _SIDEBAR_SCROLL_JS + "</body></html>"


def _places_link(
    *,
    poi_type: str = "",
    region: str = "",
    source: str = "",
    cross_ref: str = "",
    endorsed_by: str = "",
    min_photos: int = 0,
    q: str = "",
    page: int = 1,
) -> str:
    parts: list[str] = []
    for k, v in (
        ("q", q),
        ("poi_type", poi_type),
        ("region", region),
        ("source", source),
        ("cross_ref", cross_ref),
        ("endorsed_by", endorsed_by),
    ):
        if v:
            parts.append(f"{k}={_url(v)}")
    if min_photos > 0:
        parts.append(f"min_photos={min_photos}")
    if page > 1:
        parts.append(f"page={page}")
    qs = ("?" + "&".join(parts)) if parts else ""
    return f"/places{qs}"


_SOURCE_LABELS: dict[str, str] = {
    "gnis": "GNIS",
    "osm": "OSM",
    "ugrc": "UGRC",
    "ugrc_osp": "UGRC OSP",
    "nhd": "NHD",
    "nps": "NPS",
    "mrds": "MRDS",
    "wikivoyage": "Wikivoyage",
    "wikimedia": "Wikimedia",
    "atlas_obscura": "Atlas Obscura",
    "darksky": "Dark Sky",
    "locationscout": "Locationscout",
    "reddit:r/Moab": "Reddit · r/Moab",
    "reddit:r/overlanding": "Reddit · r/overlanding",
    "reddit:r/Utah": "Reddit · r/Utah",
    "reddit:r/CampingandHiking": "Reddit · r/CampingAndHiking",
    "reddit:r/hiking": "Reddit · r/hiking",
}


_SIDEBAR_SCROLL_JS = """
<script>
(function () {
  // Preserve BOTH window scroll and any internal aside scroll across nav.
  // The sidebar uses position:sticky so most filter clicks cause window
  // scroll to drift; we save+restore both axes so users land where they
  // were after a filter click.
  var key = 'scrollState:' + location.pathname;
  var aside = document.querySelector('aside');

  function save() {
    try {
      sessionStorage.setItem(key, JSON.stringify({
        win: window.scrollY || window.pageYOffset || 0,
        aside: aside ? aside.scrollTop : 0,
      }));
    } catch (_) {}
  }

  // Restore. Use a couple of frames so the layout has settled, but do
  // it before paint where we can.
  function restore() {
    try {
      var raw = sessionStorage.getItem(key);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (s && typeof s.win === 'number') {
        window.scrollTo(0, s.win);
      }
      if (aside && s && typeof s.aside === 'number') {
        aside.scrollTop = s.aside;
      }
    } catch (_) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', restore);
  } else {
    restore();
  }
  // Some browsers paint then layout-shift; restore again next frame.
  requestAnimationFrame(restore);

  var t;
  function defer() { clearTimeout(t); t = setTimeout(save, 80); }
  window.addEventListener('scroll', defer, { passive: true });
  if (aside) aside.addEventListener('scroll', defer, { passive: true });
  // Capture the most recent position even if throttled save hasn't fired.
  window.addEventListener('beforeunload', save);
  window.addEventListener('pagehide', save);
})();
</script>
"""


def _pretty(value: Any) -> str:
    """Display-friendly label: source enums get the canonical capitalization,
    everything else gets snake_case → Title Case."""
    if value is None or value == "":
        return ""
    s = str(value)
    if s in _SOURCE_LABELS:
        return _SOURCE_LABELS[s]
    if ":" in s or "/" in s:
        return s
    if any(c.isupper() for c in s) and "_" not in s:
        return s
    return s.replace("_", " ").replace("-", " ").strip().title()


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
