import { useState, useEffect } from 'react';

export function useElevation(lat: number, lng: number) {
  const [elevation, setElevation] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lat || !lng || !window.google?.maps) {
      return;
    }

    setLoading(true);
    setError(null);

    const elevator = new google.maps.ElevationService();

    elevator.getElevationForLocations(
      {
        locations: [{ lat, lng }],
      },
      (results, status) => {
        setLoading(false);
        if (status === google.maps.ElevationStatus.OK && results && results[0]) {
          setElevation(results[0].elevation);
        } else {
          setError('Could not fetch elevation');
        }
      }
    );
  }, [lat, lng]);

  // Convert meters to feet
  const elevationFeet = elevation !== null ? Math.round(elevation * 3.28084) : null;
  const elevationMeters = elevation !== null ? Math.round(elevation) : null;

  return { elevation, elevationFeet, elevationMeters, loading, error };
}
