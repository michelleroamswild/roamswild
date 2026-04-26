import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface OsmWayHistory {
  way_id: number;
  grades_seen: string[];
  fwd_only_seen: boolean[];
  current_grade: string | null;
  current_fwd_only: boolean | null;
  versions_count: number;
  first_version_at: string | null;
  last_edit_at: string | null;
  fetched_at: string;
}

interface UseOsmWayHistoryResult {
  history: OsmWayHistory | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Loads (and caches) the version history of a single OSM way via the
 * `osm-way-history` edge function. Drives the "grade range" UI on the
 * road detail panel — useful for tracks like Rusty Nail where a recent
 * edit softened a long-standing grade-5 to grade-3.
 */
export function useOsmWayHistory(wayId: number | null): UseOsmWayHistoryResult {
  const [history, setHistory] = useState<OsmWayHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bust, setBust] = useState(0);

  useEffect(() => {
    if (!wayId || !Number.isFinite(wayId)) {
      setHistory(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase.functions
      .invoke('osm-way-history', {
        body: { way_id: wayId, force: bust > 0 },
      })
      .then(async ({ data, error: invokeErr }) => {
        if (cancelled) return;
        if (invokeErr) {
          // Try to pull the response body for a more useful error
          const ctx = (invokeErr as { context?: Response }).context;
          if (ctx && typeof ctx.json === 'function') {
            try {
              const body = await ctx.json();
              setError(body?.error || invokeErr.message);
            } catch {
              setError(invokeErr.message);
            }
          } else {
            setError(invokeErr.message);
          }
          setHistory(null);
        } else {
          setHistory(data as OsmWayHistory);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load history');
        setHistory(null);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [wayId, bust]);

  const refresh = useCallback(() => setBust((n) => n + 1), []);

  return { history, loading, error, refresh };
}
