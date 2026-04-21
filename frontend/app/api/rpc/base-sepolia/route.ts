import { NextResponse } from "next/server";

const BASE_SEPOLIA_PUBLIC = "https://sepolia.base.org";

function upstreamUrl() {
  const key = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || process.env.ALCHEMY_API_KEY;
  if (key && key.length > 0) {
    return `https://base-sepolia.g.alchemy.com/v2/${key}`;
  }
  return BASE_SEPOLIA_PUBLIC;
}

/**
 * Proxies JSON-RPC to Base Sepolia so browser viem reads work (Alchemy blocks many browser origins).
 */
export async function POST(req: Request) {
  const body = await req.text();
  try {
    const res = await fetch(upstreamUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
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
    const msg = e instanceof Error ? e.message : "Upstream RPC failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
