import { NextResponse } from "next/server";

const UPSTREAM = "https://base-sepolia.g.alchemy.com/v2";

function alchemyKey(): string | undefined {
  const k = process.env.ALCHEMY_API_KEY || process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
  return k && k.length > 0 ? k : undefined;
}

/**
 * Same-origin JSON-RPC proxy for Alchemy Gas Manager / AA paymaster calls (`pm_*`).
 * Privy may merge dashboard smart-wallet URLs that still point at `base-mainnet`; routing paymaster
 * through this handler guarantees requests hit Base Sepolia for policy `b08f…` etc.
 */
export async function POST(req: Request) {
  const key = alchemyKey();
  if (!key) {
    return NextResponse.json({ error: "Missing ALCHEMY_API_KEY or NEXT_PUBLIC_ALCHEMY_API_KEY on the server." }, { status: 500 });
  }
  const body = await req.text();
  try {
    const res = await fetch(`${UPSTREAM}/${key}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body,
      cache: "no-store",
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type")?.split(";")[0] || "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upstream failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
