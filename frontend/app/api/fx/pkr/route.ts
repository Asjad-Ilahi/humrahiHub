import { NextResponse } from "next/server";

/** Used only when every upstream fails (offline build, blocked egress, etc.). Override via env if needed. */
const STATIC_FALLBACK_PKR_PER_USD = (() => {
  const n = Number(process.env.PKR_USD_FALLBACK ?? process.env.NEXT_PUBLIC_PKR_USD_FALLBACK ?? "280");
  return Number.isFinite(n) && n > 0 ? n : 280;
})();

async function frankfurter(): Promise<number | null> {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=PKR", {
      next: { revalidate: 900 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { rates?: { PKR?: number } };
    const n = json.rates?.PKR;
    return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

async function openErApi(): Promise<number | null> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { next: { revalidate: 900 } });
    if (!res.ok) return null;
    const json = (await res.json()) as { conversion_rates?: { PKR?: number } };
    const n = json.conversion_rates?.PKR;
    return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

async function currencyApiPages(): Promise<number | null> {
  try {
    const res = await fetch("https://latest.currency-api.pages.dev/v1/currencies/usd.json", {
      next: { revalidate: 900 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { usd?: { pkr?: number } };
    const n = json.usd?.pkr;
    return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export async function GET() {
  let pkrPerUsd =
    (await frankfurter()) ?? (await openErApi()) ?? (await currencyApiPages()) ?? STATIC_FALLBACK_PKR_PER_USD;

  const approximate = pkrPerUsd === STATIC_FALLBACK_PKR_PER_USD;

  return NextResponse.json({ pkrPerUsd, approximate });
}
