export interface UserLocation {
  lat: number;
  lng: number;
  name?: string;
}

const DEV_FALLBACK: UserLocation = {
  lat: 38.5733,
  lng: -109.5498,
  name: "Moab, Utah",
};

export interface GetUserLocationOptions {
  timeoutMs?: number;
  enableHighAccuracy?: boolean;
  maximumAgeMs?: number;
}

/**
 * Get the user's current geolocation. In dev mode, falls back to Moab, UT
 * if the browser geolocation request fails or is unsupported. In production,
 * the underlying error is rethrown so callers can show their own fallback UI.
 */
export async function getUserLocation(
  opts: GetUserLocationOptions = {}
): Promise<UserLocation> {
  const {
    timeoutMs = 10000,
    enableHighAccuracy = false,
    maximumAgeMs = 300000,
  } = opts;

  if (!navigator.geolocation) {
    if (import.meta.env.DEV) {
      console.info("[dev] Geolocation unsupported — defaulting to Moab, Utah");
      return DEV_FALLBACK;
    }
    throw new Error("Geolocation not supported");
  }

  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy,
        timeout: timeoutMs,
        maximumAge: maximumAgeMs,
      });
    });
    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
  } catch (err) {
    if (import.meta.env.DEV) {
      console.info("[dev] Geolocation failed — defaulting to Moab, Utah", err);
      return DEV_FALLBACK;
    }
    throw err;
  }
}
