import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SpotNaipImage {
  storage_url: string;
  width: number | null;
  height: number | null;
  taken_at: string | null;
}

/**
 * Find the NAIP satellite chip for a spot by matching on lat/lng. The legacy
 * potential_spots and the unified spots table share NUMERIC(10,7) coords, so
 * an exact-equality filter resolves cleanly without joining through the
 * (sparsely populated) extra.legacy_potential_spots_id mapping.
 */
export function useSpotNaipImage(lat: number | null, lng: number | null) {
  const [image, setImage] = useState<SpotNaipImage | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (lat == null || lng == null) {
      setImage(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setImage(null);

    (async () => {
      // PostgREST eq filter against NUMERIC(10,7); pad to 7 dp to dodge
      // float-string formatting drift (38.82177 → "38.8217700")
      const latStr = lat.toFixed(7);
      const lngStr = lng.toFixed(7);

      const { data, error } = await supabase
        .from('spots')
        .select('id, spot_images!inner(storage_url, width, height, taken_at, source)')
        .eq('latitude', latStr)
        .eq('longitude', lngStr)
        .eq('spot_images.source', 'naip')
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (error || !data) {
        setImage(null);
        setLoading(false);
        return;
      }

      const images = ((data as { spot_images?: Array<{ source: string | null; storage_url: string; width: number | null; height: number | null; taken_at: string | null }> }).spot_images) ?? [];
      const naip = images[0] ?? null;
      setImage(naip
        ? {
            storage_url: naip.storage_url,
            width: naip.width,
            height: naip.height,
            taken_at: naip.taken_at,
          }
        : null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  return { image, loading };
}
