"use client";

import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import type { User } from "@privy-io/react-auth";

type ProfileForm = {
  firstName: string;
  secondName: string;
  lastName: string;
  phone: string;
  street: string;
  streetNumber: string;
  postalCode: string;
  city: string;
  country: string;
};

type LatLng = { latitude: number; longitude: number };

const INITIAL_FORM: ProfileForm = {
  firstName: "",
  secondName: "",
  lastName: "",
  phone: "",
  street: "",
  streetNumber: "",
  postalCode: "",
  city: "",
  country: "",
};

/** Survives Privy OAuth full-page redirects (React state does not). */
const SIGNUP_DRAFT_KEY = "humrahi_signup_profile_v1";
const SIGNUP_COORDS_KEY = "humrahi_signup_coords_v1";

function isValidSignupDraft(value: unknown): value is ProfileForm {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  const keys = ["firstName", "lastName", "phone", "street", "streetNumber", "postalCode", "city", "country"] as const;
  return keys.every((k) => String(o[k] ?? "").trim().length > 0);
}

function readSignupDraftFromStorage(): ProfileForm | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SIGNUP_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isValidSignupDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeSignupDraftToStorage(details: ProfileForm) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(SIGNUP_DRAFT_KEY, JSON.stringify(details));
}

function writeSignupCoordsToStorage(coords: LatLng) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(SIGNUP_COORDS_KEY, JSON.stringify(coords));
}

function readSignupCoordsFromStorage(): LatLng | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SIGNUP_COORDS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { latitude?: number; longitude?: number };
    if (
      typeof parsed.latitude !== "number" ||
      typeof parsed.longitude !== "number" ||
      Number.isNaN(parsed.latitude) ||
      Number.isNaN(parsed.longitude)
    ) {
      return null;
    }
    return { latitude: parsed.latitude, longitude: parsed.longitude };
  } catch {
    return null;
  }
}

function clearSignupSessionStorage() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(SIGNUP_DRAFT_KEY);
  sessionStorage.removeItem(SIGNUP_COORDS_KEY);
}

function isBrowserGeolocationContext(): boolean {
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

    window.setTimeout(() => {
      finish(() => reject(new Error("watchPosition timeout")));
    }, timeoutMs);
  });
}

async function tryGpsCoordinates(): Promise<LatLng | null> {
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

/** Forward geocode from the address the user typed (no GPS permission). Photon allows browser CORS. */
async function geocodeAddressFromForm(details: ProfileForm): Promise<LatLng | null> {
  const q = [details.streetNumber, details.street, details.postalCode, details.city, details.country]
    .map((s) => String(s).trim())
    .filter(Boolean)
    .join(", ");
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

/** Rough IP-based location when GPS and geocode fail (still non-null lat/lng for most users). */
async function fetchIpApproxLocation(): Promise<LatLng | null> {
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
 * Best available coordinates: GPS (including watch retry), then address geocode, then IP.
 */
async function resolveBestCoordinates(details: ProfileForm | null): Promise<LatLng | null> {
  const gps = await tryGpsCoordinates();
  if (gps) return gps;

  if (details) {
    const geo = await geocodeAddressFromForm(details);
    if (geo) return geo;
  }

  return fetchIpApproxLocation();
}

function readEmbeddedWalletAddress(user: User | null | undefined): string | null {
  if (!user) return null;
  const embedded = user.wallet?.address;
  if (embedded) return embedded;
  const linked = user.linkedAccounts?.find((a) => a.type === "wallet");
  if (linked && "address" in linked && typeof linked.address === "string") {
    return linked.address;
  }
  return null;
}

function readLinkedSmartWalletAddress(user: User | null | undefined): string | null {
  if (!user) return null;
  const linked = user.linkedAccounts?.find((a) => a.type === "smart_wallet");
  if (linked && "address" in linked && typeof linked.address === "string") {
    return linked.address;
  }
  return null;
}

function readSmartWalletFromUserRecord(user: User | null | undefined): string | null {
  if (!user) return null;
  const fromLinked = readLinkedSmartWalletAddress(user);
  if (fromLinked) return fromLinked;
  const record = user as unknown as { smartWallet?: { address?: string } };
  if (record.smartWallet?.address) return record.smartWallet.address;
  return null;
}

function readOptimisticSmartAccountAddress(
  client: { account?: { address?: string } } | undefined | null
): string | null {
  const addr = client?.account?.address;
  return typeof addr === "string" && addr.length > 0 ? addr : null;
}

function optimisticAddressFromSmartClient(client: unknown): string | null {
  return readOptimisticSmartAccountAddress(client as { account?: { address?: string } } | undefined);
}

export default function AuthFlow() {
  const router = useRouter();
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { client: smartWalletClient } = useSmartWallets();
  const [form, setForm] = useState<ProfileForm>(INITIAL_FORM);
  const [step, setStep] = useState<"details" | "login" | "done">("details");
  const [submittedDetails, setSubmittedDetails] = useState<ProfileForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "resolving" | "resolved" | "skipped">("idle");
  const [saveAttempt, setSaveAttempt] = useState(0);
  /** After reading sessionStorage / redirect decision so we do not flash the details form after Privy. */
  const [bootstrapped, setBootstrapped] = useState(false);

  const persistStartedRef = useRef(false);
  const waitStartRef = useRef<number | null>(null);
  const persistInFlightRef = useRef(false);
  /** Filled on user gestures (form submit / login click) so GPS permission ties to real interaction. */
  const prefetchedCoordsRef = useRef<LatLng | null>(null);
  const latestRef = useRef({
    user,
    smartWalletClient,
  });
  latestRef.current = { user, smartWalletClient };

  const prevAuthenticatedRef = useRef<boolean | null>(null);

  useLayoutEffect(() => {
    if (!ready) return;
    const draft = readSignupDraftFromStorage();

    if (authenticated && !draft) {
      router.replace("/home");
      setBootstrapped(true);
      return;
    }

    if (draft) {
      setSubmittedDetails(draft);
      setForm(draft);
      setStep("login");
      waitStartRef.current = null;
      persistStartedRef.current = false;
      const storedCoords = readSignupCoordsFromStorage();
      if (storedCoords) prefetchedCoordsRef.current = storedCoords;
    }

    setBootstrapped(true);
  }, [ready, authenticated, router]);

  useEffect(() => {
    const prev = prevAuthenticatedRef.current;
    if (prev === true && !authenticated) {
      waitStartRef.current = null;
      persistStartedRef.current = false;
      prefetchedCoordsRef.current = null;
      clearSignupSessionStorage();
    }
    prevAuthenticatedRef.current = authenticated;
  }, [authenticated]);

  const walletAddress = useMemo(() => readEmbeddedWalletAddress(user), [user]);

  const smartWalletAddress = useMemo(() => {
    const linkedOrUser = readSmartWalletFromUserRecord(user);
    if (linkedOrUser) return linkedOrUser;
    return optimisticAddressFromSmartClient(smartWalletClient);
  }, [user, smartWalletClient]);

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:5000";

  const persistProfileOnce = async () => {
    if (persistInFlightRef.current) return;
    persistInFlightRef.current = true;

    try {
      const { user: u, smartWalletClient: swClient } = latestRef.current;
      if (!u?.id || !submittedDetails) {
        persistStartedRef.current = false;
        return;
      }

      setSaving(true);
      setError(null);

      setLocationStatus("resolving");
      let coords: LatLng | null = prefetchedCoordsRef.current;
      if (!coords) {
        coords = await resolveBestCoordinates(submittedDetails);
      }
      setLocationStatus(coords ? "resolved" : "skipped");
      if (coords) prefetchedCoordsRef.current = coords;

      const eoa = readEmbeddedWalletAddress(u);
      const smart = readSmartWalletFromUserRecord(u) ?? optimisticAddressFromSmartClient(swClient);

      const payload = {
        privyUserId: u.id,
        email: u.email?.address ?? null,
        firstName: submittedDetails.firstName,
        secondName: submittedDetails.secondName || null,
        lastName: submittedDetails.lastName,
        phone: submittedDetails.phone,
        street: submittedDetails.street,
        streetNumber: submittedDetails.streetNumber,
        postalCode: submittedDetails.postalCode,
        city: submittedDetails.city,
        country: submittedDetails.country,
        chainId: Number(process.env.NEXT_PUBLIC_BASE_CHAIN_ID ?? 8453),
        walletAddress: eoa,
        smartWalletAddress: smart,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
      };

      const response = await fetch(`${backendUrl}/api/profiles/upsert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error ?? "Failed to save profile.");
        setSaving(false);
        persistStartedRef.current = false;
        setSaveAttempt((n) => n + 1);
        return;
      }

      setSaved(true);
      setStep("done");
      setSaving(false);
      clearSignupSessionStorage();
      router.replace("/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong while saving.");
      setSaving(false);
      persistStartedRef.current = false;
      setSaveAttempt((n) => n + 1);
    } finally {
      persistInFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (!ready || !authenticated || !submittedDetails || saved) {
      return;
    }
    if (waitStartRef.current === null) {
      waitStartRef.current = Date.now();
    }

    const u = user;
    if (!u?.id) return;

    const eoa = readEmbeddedWalletAddress(u);
    const smart = readSmartWalletFromUserRecord(u) ?? optimisticAddressFromSmartClient(smartWalletClient);
    const elapsed = Date.now() - (waitStartRef.current ?? 0);
    const maxWaitMs = 32000;
    const shouldSave = (Boolean(eoa) && Boolean(smart)) || elapsed >= maxWaitMs;

    if (!shouldSave) return;
    if (persistStartedRef.current) return;

    persistStartedRef.current = true;
    void persistProfileOnce();
  }, [ready, authenticated, submittedDetails, saved, user, smartWalletClient, saveAttempt]);

  const onSubmitDetails = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const requiredChecks: Array<[keyof ProfileForm, string]> = [
      ["firstName", "First name"],
      ["lastName", "Last name"],
      ["phone", "Phone number"],
      ["street", "Street"],
      ["streetNumber", "Street number"],
      ["postalCode", "Postal code"],
      ["city", "City"],
      ["country", "Country"],
    ];
    const missing = requiredChecks
      .filter(([key]) => !String(form[key]).trim())
      .map(([, label]) => label);
    if (missing.length > 0) {
      setError(`Please fill required fields: ${missing.join(", ")}`);
      return;
    }
    prefetchedCoordsRef.current = null;
    const addressSnapshot: ProfileForm = { ...form };
    writeSignupDraftToStorage(addressSnapshot);
    setSubmittedDetails(form);
    setStep("login");
    void resolveBestCoordinates(addressSnapshot).then((c) => {
      if (c) {
        prefetchedCoordsRef.current = c;
        writeSignupCoordsToStorage(c);
      }
    });
  };

  if (!ready || !bootstrapped) {
    return <div className="text-center text-sm text-text-secondary">Preparing secure sign-in...</div>;
  }

  if (authenticated && !submittedDetails && !readSignupDraftFromStorage()) {
    return <div className="text-center text-sm text-text-secondary">Taking you home…</div>;
  }

  if (step === "details") {
    return (
      <div className="space-y-7">
        <div className="rounded-3xl border border-stroke bg-white p-6 md:p-8">
          <p className="text-xs uppercase tracking-[0.22em] text-text-secondary">Step 1</p>
          <h1 className="mt-3 text-3xl font-semibold text-secondary md:text-4xl">Tell us about yourself</h1>
          <p className="mt-4 max-w-2xl text-sm text-text-secondary md:text-base">
            Add your details first. Then continue with Google or Email login to create your wallet and smart wallet on Base.
          </p>

          <form onSubmit={onSubmitDetails} className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="First name" value={form.firstName} onChange={(value) => setForm((p) => ({ ...p, firstName: value }))} required />
            <Field
              label="Middle name (optional)"
              value={form.secondName}
              onChange={(value) => setForm((p) => ({ ...p, secondName: value }))}
            />
            <Field label="Last name" value={form.lastName} onChange={(value) => setForm((p) => ({ ...p, lastName: value }))} required />
            <Field label="Phone number" value={form.phone} onChange={(value) => setForm((p) => ({ ...p, phone: value }))} required />
            <Field label="Street" value={form.street} onChange={(value) => setForm((p) => ({ ...p, street: value }))} required />
            <Field label="Street number" value={form.streetNumber} onChange={(value) => setForm((p) => ({ ...p, streetNumber: value }))} required />
            <Field label="Postal code" value={form.postalCode} onChange={(value) => setForm((p) => ({ ...p, postalCode: value }))} required />
            <Field label="City" value={form.city} onChange={(value) => setForm((p) => ({ ...p, city: value }))} required />
            <Field label="Country" value={form.country} onChange={(value) => setForm((p) => ({ ...p, country: value }))} required />
            <div className="md:col-span-2 mt-2 flex items-center gap-4">
              <button
                type="submit"
                className="rounded-full bg-primary px-8 py-3 text-sm font-semibold text-secondary transition-transform duration-300 hover:-translate-y-0.5"
              >
                Continue to login
              </button>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (step === "login" && !authenticated) {
    return (
      <div className="space-y-8">
        <div className="rounded-3xl border border-stroke bg-white p-8 text-center">
          <p className="text-xs uppercase tracking-[0.22em] text-text-secondary">Step 2</p>
          <h2 className="mt-3 text-3xl font-semibold text-secondary">Secure login</h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-text-secondary">
            Continue with Google or Email. We will create your wallets on Base and save your profile automatically.
          </p>
          <div className="mt-7 flex justify-center">
            <button
              type="button"
              onClick={() => {
                if (submittedDetails) {
                  void resolveBestCoordinates(submittedDetails).then((c) => {
                    if (c) {
                      prefetchedCoordsRef.current = c;
                      writeSignupCoordsToStorage(c);
                    }
                  });
                }
                login();
              }}
              className="rounded-full bg-secondary px-10 py-3 text-base font-semibold text-primary transition-transform duration-300 hover:-translate-y-0.5 "
            >
              Continue with Google or Email
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-stroke bg-white p-6 md:p-8">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-text-secondary">Almost done</p>
          <h1 className="mt-2 text-3xl font-semibold text-secondary">Setting up your account</h1>
          <p className="mt-3 text-sm text-text-secondary">
            Wallet: {walletAddress ?? "creating…"} | Smart wallet: {smartWalletAddress ?? "creating…"}
          </p>
          <p className="mt-2 text-sm text-text-secondary">
            {saving
              ? locationStatus === "resolving"
                ? "Saving profile (getting your location)…"
                : "Saving profile to the database…"
              : "We are preparing your wallets and will save your details automatically."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            clearSignupSessionStorage();
            logout();
          }}
          className="rounded-full border border-stroke px-5 py-2 text-sm font-medium text-secondary transition-colors hover:bg-card"
        >
          Logout
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-3xl border border-stroke bg-card/60 p-6 md:grid-cols-2">
        <Preview label="First name" value={submittedDetails?.firstName} />
        <Preview label="Middle name" value={submittedDetails?.secondName || "—"} />
        <Preview label="Last name" value={submittedDetails?.lastName} />
        <Preview label="Phone number" value={submittedDetails?.phone} />
        <Preview label="Street" value={submittedDetails?.street} />
        <Preview label="Street number" value={submittedDetails?.streetNumber} />
        <Preview label="Postal code" value={submittedDetails?.postalCode} />
        <Preview label="City" value={submittedDetails?.city} />
        <Preview label="Country" value={submittedDetails?.country} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        {saved && <p className="text-sm font-medium text-secondary">Profile saved. Redirecting…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
};

function Field({ label, value, onChange, required = false }: FieldProps) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-secondary">{label}</span>
      <input
        className="rounded-2xl border border-stroke bg-white px-4 py-3 text-sm text-secondary outline-none transition-colors focus:border-secondary"
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Preview({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-[0.16em] text-text-secondary">{label}</p>
      <p className="mt-1 text-sm font-medium text-secondary">{value || "—"}</p>
    </div>
  );
}
