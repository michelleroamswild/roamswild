import { useState, useEffect } from 'react';

export function useElevation(lat: number, lng: number) {
  const [elevation, setElevation] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lat || !lng) {
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    // Use USGS National Map Elevation Point Query Service (free, no API key)
    const url = `https://epqs.nationalmap.gov/v1/json?x=${lng}&y=${lat}&units=Meters&output=json`;

    fetch(url, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        const elevationValue = data?.value;
        if (elevationValue !== undefined && elevationValue !== null) {
          setElevation(Number(elevationValue));
        } else {
          setError('Could not fetch elevation');
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError('Could not fetch elevation');
        }
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  }, [lat, lng]);

  // Convert meters to feet
  const elevationFeet = elevation !== null ? Math.round(elevation * 3.28084) : null;
  const elevationMeters = elevation !== null ? Math.round(elevation) : null;

  return { elevation, elevationFeet, elevationMeters, loading, error };
}
