/**
 * Pakistani Rupee (PKR) per 1 USD. Stored goals remain USDC ≈ USD cents server-side.
 * Prefer same-origin `/api/fx/pkr` (server fetch, no browser CORS). Client direct calls kept as backup.
 */

let cache: { pkrPerUsd: number; fetchedAt: number } | null = null;
const TTL_MS = 45 * 60 * 1000;

const CLIENT_FALLBACK_PKR_PER_USD = 280;

async function fetchPkrFromSameOriginApi(): Promise<number | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch(`${window.location.origin}/api/fx/pkr`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { pkrPerUsd?: number };
    const n = json.pkrPerUsd;
    return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

async function fetchPkrDirectFrankfurter(): Promise<number | null> {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=PKR", { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { rates?: { PKR?: number } };
    const n = json.rates?.PKR;
    return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

async function fetchPkrDirectOpenEr(): Promise<number | null> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { conversion_rates?: { PKR?: number } };
    const n = json.conversion_rates?.PKR;
    return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export async function fetchPkrPerUsd(): Promise<number> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) {
    return cache.pkrPerUsd;
  }

  const pkrPerUsd =
    (await fetchPkrFromSameOriginApi()) ??
    (await fetchPkrDirectFrankfurter()) ??
    (await fetchPkrDirectOpenEr()) ??
    CLIENT_FALLBACK_PKR_PER_USD;

  cache = { pkrPerUsd, fetchedAt: Date.now() };
  return pkrPerUsd;
}

export function usdCentsToPkrAmount(cents: number, pkrPerUsd: number): number {
  return (cents / 100) * pkrPerUsd;
}

export function pkrGoalToUsdCents(pkr: number, pkrPerUsd: number): number {
  if (!Number.isFinite(pkr) || pkr <= 0 || !Number.isFinite(pkrPerUsd) || pkrPerUsd <= 0) return 0;
  const usd = pkr / pkrPerUsd;
  return Math.max(1, Math.round(usd * 100));
}

export function formatPkrFromAmount(amount: number, opts?: { maximumFractionDigits?: number }): string {
  const max = opts?.maximumFractionDigits ?? 0;
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    minimumFractionDigits: 0,
    maximumFractionDigits: max,
  }).format(amount);
}
