import { useEffect, useMemo, useRef, useState } from 'react';
import type { SelectedLocation } from '@/components/LocationSelector';
import { Play, Pause, X } from '@phosphor-icons/react';

// Bulk analysis driver that piggybacks on the existing DispersedExplorer
// analysis pipeline. Auto-pans the map to a series of tile centers; each
// pan triggers the existing fetch/save flow because setSearchLocation
// changes drive the same useEffects the user sees when they pan manually.

// US state bounding boxes (rough). Generates tile centers within these.
const STATE_BBOX: Record<string, { name: string; bounds: [number, number, number, number] }> = {
  // [west, south, east, north]
  UT: { name: 'Utah',       bounds: [-114.05, 36.997, -109.04, 42.0017] },
  CA: { name: 'California', bounds: [-124.42, 32.534, -114.13, 42.0096] },
  NV: { name: 'Nevada',     bounds: [-120.01, 35.001, -114.04, 42.0022] },
  AZ: { name: 'Arizona',    bounds: [-114.82, 31.332, -109.05, 37.0042] },
  CO: { name: 'Colorado',   bounds: [-109.06, 36.992, -102.04, 41.0034] },
  NM: { name: 'New Mexico', bounds: [-109.05, 31.332, -103.00, 37.0003] },
  ID: { name: 'Idaho',      bounds: [-117.24, 41.988, -111.04, 49.0011] },
  MT: { name: 'Montana',    bounds: [-116.05, 44.358, -104.04, 49.0011] },
  WY: { name: 'Wyoming',    bounds: [-111.06, 40.994, -104.05, 45.0058] },
  OR: { name: 'Oregon',     bounds: [-124.57, 41.991, -116.46, 46.2920] },
  WA: { name: 'Washington', bounds: [-124.85, 45.543, -116.92, 49.0024] },
};

const TILE_STEP_DEG = 0.25;       // ~17 mi at mid-latitudes
const DEFAULT_TILE_DELAY_MS = 30_000;  // 30s — generous so analysis + save complete
const MAX_TILE_DELAY_MS = 120_000;     // 2 min hard cap if loading never resolves
const STORAGE_KEY = 'bulk-pan-state-v1'; // persists progress across reloads

interface BulkPanPanelProps {
  loading: boolean;                                    // analysis loading from explorer
  lastAnalysedAt: Date | null;                         // bumps on successful save
  setSearchLocation: (loc: SelectedLocation | null) => void;
  onClose: () => void;
}

interface Tile {
  lat: number;
  lng: number;
  index: number;     // 1-based for display
}

function generateTiles(bounds: [number, number, number, number], step: number): Tile[] {
  const [west, south, east, north] = bounds;
  const out: Tile[] = [];
  let i = 1;
  for (let lat = south; lat <= north; lat += step) {
    for (let lng = west; lng <= east; lng += step) {
      out.push({ lat: +(lat + step / 2).toFixed(4), lng: +(lng + step / 2).toFixed(4), index: i++ });
    }
  }
  return out;
}

export const BulkPanPanel = ({ loading, lastAnalysedAt, setSearchLocation, onClose }: BulkPanPanelProps) => {
  const [stateCode, setStateCode] = useState<string>('UT');
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: Tile | null }>({
    done: 0, total: 0, current: null,
  });
  const [delayMs, setDelayMs] = useState(DEFAULT_TILE_DELAY_MS);
  // Per-tile outcome counts so the user can see whether the run is healthy
  const [outcomes, setOutcomes] = useState({ ok: 0, timeout: 0, error: 0, no_save: 0 });
  const lastAnalysedAtRef = useRef(lastAnalysedAt);
  useEffect(() => { lastAnalysedAtRef.current = lastAnalysedAt; }, [lastAnalysedAt]);
  // Resume support: if there's a saved run for the current state, offer to pick up
  const [resumeFromIndex, setResumeFromIndex] = useState<number | null>(null);

  // On mount or state change, check for a saved run we could resume
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { setResumeFromIndex(null); return; }
      const saved = JSON.parse(raw) as { state?: string; tileIndex?: number; total?: number; outcomes?: typeof outcomes };
      if (saved.state === stateCode && typeof saved.tileIndex === 'number' && saved.tileIndex > 0) {
        setResumeFromIndex(saved.tileIndex);
        if (saved.outcomes) setOutcomes(saved.outcomes);
      } else {
        setResumeFromIndex(null);
      }
    } catch {
      setResumeFromIndex(null);
    }
  }, [stateCode]);

  // Refs let the run loop see fresh state without restarting on every render
  const loadingRef = useRef(loading);
  const pausedRef = useRef(paused);
  const runningRef = useRef(running);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { runningRef.current = running; }, [running]);

  const tiles = useMemo(() => {
    const def = STATE_BBOX[stateCode];
    return def ? generateTiles(def.bounds, TILE_STEP_DEG) : [];
  }, [stateCode]);

  const runFromIndex = async (startIndex: number) => {
    if (running) return;
    if (tiles.length === 0) return;
    runningRef.current = true;
    pausedRef.current = false;
    setRunning(true);
    setPaused(false);
    setProgress({ done: startIndex, total: tiles.length, current: null });
    if (startIndex === 0) {
      setOutcomes({ ok: 0, timeout: 0, error: 0, no_save: 0 });
    }

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const localOutcomes = { ...outcomes };
    if (startIndex === 0) {
      localOutcomes.ok = 0;
      localOutcomes.timeout = 0;
      localOutcomes.error = 0;
      localOutcomes.no_save = 0;
    }

    for (let i = startIndex; i < tiles.length; i++) {
      while (pausedRef.current && runningRef.current) {
        await sleep(500);
      }
      if (!runningRef.current) break;

      const tile = tiles[i];
      setProgress({ done: i, total: tiles.length, current: tile });

      // Persist progress so a browser crash / accidental tab close can resume.
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          state: stateCode,
          tileIndex: i,
          total: tiles.length,
          outcomes: localOutcomes,
          savedAt: new Date().toISOString(),
        }));
      } catch {}

      // Each tile wrapped in try/catch so any error keeps the loop going.
      try {
        // Capture the lastAnalysedAt timestamp before this tile so we can
        // detect after the wait whether a save actually occurred. The
        // explorer bumps lastAnalysedAt only on successful save; if it
        // doesn't change, the save effect skipped (e.g. analysis returned
        // 0 spots) — count as no_save.
        const beforeSavedAt = lastAnalysedAtRef.current;
        setSearchLocation({
          lat: tile.lat,
          lng: tile.lng,
          name: `${stateCode} tile ${tile.index}`,
        });

        const waitStart = Date.now();
        await sleep(750);
        while (loadingRef.current && Date.now() - waitStart < MAX_TILE_DELAY_MS) {
          await sleep(500);
        }

        const timedOut = Date.now() - waitStart >= MAX_TILE_DELAY_MS;
        if (timedOut) {
          localOutcomes.timeout += 1;
          console.warn(`[BulkPan] tile ${tile.index} timed out at ${MAX_TILE_DELAY_MS}ms`);
        }

        // Wait the rest of the tile delay so the save effect has a chance to fire
        const remaining = Math.max(0, delayMs - (Date.now() - waitStart));
        if (remaining > 0) await sleep(remaining);

        // Now check whether a save actually occurred during this tile's window
        if (!timedOut) {
          const afterSavedAt = lastAnalysedAtRef.current;
          const savedThisTile = afterSavedAt !== beforeSavedAt && afterSavedAt != null;
          if (savedThisTile) {
            localOutcomes.ok += 1;
          } else {
            localOutcomes.no_save += 1;
            console.warn(`[BulkPan] tile ${tile.index} (${tile.lat.toFixed(3)},${tile.lng.toFixed(3)}) finished but no save fired — likely upstream API failure or empty analysis`);
          }
        }
      } catch (err) {
        localOutcomes.error += 1;
        console.error(`[BulkPan] tile ${tile.index} threw — continuing`, err);
        // Brief pause before next tile so we don't hammer in a tight failure loop
        await sleep(2000);
      }

      setOutcomes({ ...localOutcomes });
    }

    setProgress((p) => ({ ...p, done: tiles.length, current: null }));
    setRunning(false);
    runningRef.current = false;
    // Keep the saved state for visibility, but mark complete
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        state: stateCode,
        tileIndex: tiles.length,
        total: tiles.length,
        outcomes: localOutcomes,
        savedAt: new Date().toISOString(),
        completed: true,
      }));
    } catch {}
  };

  const start = () => runFromIndex(0);
  const resume = () => {
    if (resumeFromIndex != null) runFromIndex(resumeFromIndex);
  };
  const clearSaved = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setResumeFromIndex(null);
    setOutcomes({ ok: 0, timeout: 0, error: 0 });
  };
  const restartState = () => {
    if (!confirm(`Restart ${stateCode} from tile 1? This drops any saved progress for this state.`)) {
      return;
    }
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setResumeFromIndex(null);
    setOutcomes({ ok: 0, timeout: 0, error: 0 });
    runFromIndex(0);
  };

  const stop = () => {
    runningRef.current = false;
    pausedRef.current = false;
    setRunning(false);
    setPaused(false);
  };

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="absolute top-20 right-4 z-20 w-[320px] bg-card border border-border rounded-lg shadow-xl">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 className="text-sm font-semibold">Bulk auto-pan</h3>
        <button
          onClick={onClose}
          className="p-0.5 text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          <X className="w-4 h-4" weight="bold" />
        </button>
      </div>
      <div className="p-3 space-y-3 text-xs">
        <div>
          <label className="block text-muted-foreground mb-1">State</label>
          <select
            value={stateCode}
            onChange={(e) => setStateCode(e.target.value)}
            disabled={running}
            className="w-full bg-muted border border-border rounded px-2 py-1 text-sm"
          >
            {Object.entries(STATE_BBOX).map(([code, { name }]) => (
              <option key={code} value={code}>{name} ({code})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-muted-foreground mb-1">
            Delay between tiles: {Math.round(delayMs / 1000)}s
          </label>
          <input
            type="range"
            min={10000}
            max={60000}
            step={5000}
            value={delayMs}
            onChange={(e) => setDelayMs(parseInt(e.target.value))}
            disabled={running}
            className="w-full"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Higher = more reliable. Analysis usually completes in 10-20s; cache save adds ~5s.
          </p>
        </div>

        <div className="text-muted-foreground">
          {tiles.length > 0 && (
            <p>{tiles.length} tiles · est. {Math.ceil((tiles.length * delayMs) / 60000)} min total</p>
          )}
        </div>

        {running && (
          <div className="space-y-1">
            <div className="h-1.5 w-full bg-muted rounded overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-foreground font-medium">
              Tile {progress.done + (progress.current ? 1 : 0)} of {progress.total} ({pct}%)
            </p>
            {progress.current && (
              <p className="text-muted-foreground font-mono">
                {progress.current.lat.toFixed(3)}, {progress.current.lng.toFixed(3)}
              </p>
            )}
            <p className="text-muted-foreground italic">
              {loading ? 'analyzing...' : 'waiting buffer...'}
            </p>
          </div>
        )}

        {(outcomes.ok + outcomes.timeout + outcomes.error + outcomes.no_save) > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
            <span className="text-emerald-700">✓ saved {outcomes.ok}</span>
            <span className="text-amber-700">⌀ no save {outcomes.no_save}</span>
            <span className="text-orange-700">⏱ timeout {outcomes.timeout}</span>
            <span className="text-red-700">✗ error {outcomes.error}</span>
          </div>
        )}

        {!running && resumeFromIndex != null && (
          <div className="border border-amber-300 bg-amber-50 rounded p-2 space-y-1.5 text-[11px]">
            <p className="text-amber-900">
              Saved progress for {stateCode}: tile {resumeFromIndex} of {progress.total || tiles.length}
            </p>
            <div className="flex gap-1.5">
              <button
                onClick={resume}
                className="flex-1 px-2 py-1 rounded bg-amber-600 text-white font-medium"
              >
                Resume
              </button>
              <button
                onClick={clearSaved}
                className="px-2 py-1 rounded border border-amber-400 text-amber-900"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          {!running ? (
            <>
              <button
                onClick={start}
                disabled={tiles.length === 0}
                className="flex-1 px-3 py-1.5 rounded bg-primary text-primary-foreground font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" weight="fill" /> Start
              </button>
              <button
                onClick={restartState}
                disabled={tiles.length === 0}
                className="px-3 py-1.5 rounded border border-amber-400 bg-amber-50 text-amber-900 font-medium text-[11px]"
                title="Wipe saved progress and start this state from tile 1"
              >
                Restart state
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setPaused((p) => !p)}
                className="flex-1 px-3 py-1.5 rounded border border-border bg-muted/40 font-medium flex items-center justify-center gap-1.5"
              >
                {paused ? (
                  <><Play className="w-3.5 h-3.5" weight="fill" /> Resume</>
                ) : (
                  <><Pause className="w-3.5 h-3.5" weight="fill" /> Pause</>
                )}
              </button>
              <button
                onClick={stop}
                className="px-3 py-1.5 rounded border border-red-400 bg-red-50 text-red-800 font-medium"
              >
                Stop
              </button>
            </>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground italic">
          Each pan triggers the same fetch + save flow as manual panning, so all
          spots land in the unified spots table via the existing pipeline.
        </p>
      </div>
    </div>
  );
};
