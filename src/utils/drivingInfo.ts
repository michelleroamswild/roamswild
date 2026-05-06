/**
 * Driving info between two points.
 *
 * Tries Google Directions first; falls back to a haversine-based estimate
 * (straight-line × 2.5 road factor at 30 mph) when Maps isn't loaded, the
 * Directions request times out, or the call errors out. The fallback is
 * useful for scoring (cheap, no API call) and as a safety net at add-time.
 */

export interface DrivingInfo {
  distanceMiles: number;
  durationMinutes: number;
  isReachable: boolean;
  /** True when the values came from Google; false if we used the heuristic. */
  fromDirections: boolean;
}

const HAVERSINE_R_MI = 3959;
const ROAD_FACTOR = 2.5;
const RURAL_MPH = 30;
const DIRECTIONS_TIMEOUT_MS = 8000;

function haversineMiles(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): number {
  const dLat = ((destLat - originLat) * Math.PI) / 180;
  const dLng = ((destLng - originLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((originLat * Math.PI) / 180) *
      Math.cos((destLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return HAVERSINE_R_MI * c;
}

export function estimateDrivingFromHaversine(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): DrivingInfo {
  const straight = haversineMiles(originLat, originLng, destLat, destLng);
  const road = straight * ROAD_FACTOR;
  return {
    distanceMiles: road,
    durationMinutes: Math.round((road / RURAL_MPH) * 60),
    isReachable: true,
    fromDirections: false,
  };
}

export async function getDrivingInfo(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  destName?: string,
): Promise<DrivingInfo> {
  const fallback = estimateDrivingFromHaversine(originLat, originLng, destLat, destLng);

  if (!window.google?.maps) {
    console.log(`[getDrivingInfo] Google Maps not loaded, using fallback for ${destName}`);
    return fallback;
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log(
        `[getDrivingInfo] Timeout for ${destName}, using fallback: ${Math.round(fallback.distanceMiles)} mi`,
      );
      resolve(fallback);
    }, DIRECTIONS_TIMEOUT_MS);

    try {
      const directionsService = new google.maps.DirectionsService();
      directionsService.route(
        {
          origin: { lat: originLat, lng: originLng },
          destination: { lat: destLat, lng: destLng },
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          clearTimeout(timeout);
          if (status === google.maps.DirectionsStatus.OK && result?.routes[0]?.legs[0]) {
            const leg = result.routes[0].legs[0];
            const miles = (leg.distance?.value || 0) / 1609.34;
            const mins = (leg.duration?.value || 0) / 60;
            resolve({
              distanceMiles: miles,
              durationMinutes: mins,
              isReachable: true,
              fromDirections: true,
            });
          } else if (status === google.maps.DirectionsStatus.ZERO_RESULTS) {
            resolve({ ...fallback, isReachable: false });
          } else {
            resolve(fallback);
          }
        },
      );
    } catch {
      clearTimeout(timeout);
      resolve(fallback);
    }
  });
}

export function formatDrivingTime(minutes: number, eachWay = true): string {
  const m = Math.round(minutes);
  const body = m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
  return eachWay ? `${body} each way` : body;
}
