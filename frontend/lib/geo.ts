export type LatLng = { latitude: number; longitude: number };

/** Same rule as signup/login: allow local dev hostnames even when the bar shows “not secure” for http. */
export function isBrowserGeolocationContext(): boolean {
  if (typeof window === "undefined") return false;
  if (!("geolocation" in navigator)) return false;
  return window.isSecureContext || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

function getCurrentPositionPromise(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

/** First fix from watchPosition (often succeeds when getCurrentPosition times out). */
function getFirstWatchPosition(timeoutMs: number): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    let settled = false;
    let watchId = 0;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      navigator.geolocation.clearWatch(watchId);
      fn();
    };

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        finish(() => resolve(pos));
      },
      (err) => {
        finish(() => reject(err));
      },
      { enableHighAccuracy: true, maximumAge: 0 }
    );

    globalThis.setTimeout(() => {
      finish(() => reject(new Error("watchPosition timeout")));
    }, timeoutMs);
  });
}

async function tryGpsLatLng(): Promise<LatLng | null> {
  if (!isBrowserGeolocationContext()) return null;

  const attempts: PositionOptions[] = [
    { enableHighAccuracy: true, maximumAge: 0, timeout: 25000 },
    { enableHighAccuracy: false, maximumAge: 120_000, timeout: 35000 },
    { enableHighAccuracy: false, maximumAge: 600_000, timeout: 45000 },
  ];

  for (const opts of attempts) {
    try {
      const pos = await getCurrentPositionPromise(opts);
      const { latitude, longitude } = pos.coords;
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        return { latitude, longitude };
      }
    } catch {
      /* try next */
    }
  }

  try {
    const pos = await getFirstWatchPosition(22000);
    const { latitude, longitude } = pos.coords;
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return { latitude, longitude };
    }
  } catch {
    /* fall through */
  }

  return null;
}

/** Forward geocode; Photon allows browser CORS. */
async function geocodePhoton(query: string): Promise<LatLng | null> {
  const q = query.trim();
  if (!q) return null;

  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{ geometry?: { coordinates?: [number, number] } }>;
    };
    const coords = data?.features?.[0]?.geometry?.coordinates;
    if (!coords || coords.length < 2) return null;
    const [lon, lat] = coords;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { latitude: lat, longitude: lon };
  } catch {
    return null;
  }
}

async function fetchIpApproxLatLng(): Promise<LatLng | null> {
  try {
    const res = await fetch("https://get.geojs.io/v1/ip/geo.json");
    if (!res.ok) return null;
    const j = (await res.json()) as { latitude?: string; longitude?: string };
    const lat = Number.parseFloat(String(j.latitude ?? ""));
    const lon = Number.parseFloat(String(j.longitude ?? ""));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { latitude: lat, longitude: lon };
  } catch {
    return null;
  }
}

/**
 * Same strategy as signup/login: GPS (with watch retry), optional address geocode, then IP.
 * Does not throw — returns null only if every source failed.
 */
export async function resolveBestLatLngFromQuery(geocodeQuery: string | null | undefined): Promise<LatLng | null> {
  const gps = await tryGpsLatLng();
  if (gps) return gps;

  const trimmed = geocodeQuery?.trim();
  if (trimmed) {
    const geo = await geocodePhoton(trimmed);
    if (geo) return geo;
  }

  return fetchIpApproxLatLng();
}

export function geolocationErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message === "unsupported") {
    return "This browser cannot use location here.";
  }
  if (err instanceof Error && err.message === "insecure") {
    return "Open this app over https or localhost, then try again.";
  }
  const code =
    typeof err === "object" && err !== null && "code" in err ? Number((err as GeolocationPositionError).code) : NaN;
  if (code === 1) {
    return "Location was blocked for this page. Allow location in the site menu next to the address bar, then try again.";
  }
  if (code === 2) {
    return "Could not get a position fix. Try again in a moment.";
  }
  if (code === 3) {
    return "Location timed out. Try again.";
  }
  return "Could not read location. Try again.";
}
