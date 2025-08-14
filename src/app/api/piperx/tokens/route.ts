import { NextResponse } from "next/server";

const BASE = "https://api.storyapis.com";
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || "1315"); // Story mainnet per docs

export const revalidate = 300; // cache 5 menit di edge

export async function GET() {
  try {
    const url = `${BASE}/price/token/getAllTokens?chainId=${CHAIN_ID}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
      const text = await r.text();
      return NextResponse.json({ error: `Upstream ${r.status}: ${text}` }, { status: 502 });
    }
    const out = await r.json() as Array<{ id: string; symbol: string; decimals?: number }>;
    // Normalisasi ke bentuk ringan untuk klien
    const tokens = out
      .filter(t => /^0x[0-9a-fA-F]{40}$/.test(t.id))
      .map(t => ({
        symbol: t.symbol?.toUpperCase() || t.id,
        address: t.id as `0x${string}`,
        decimals: t.decimals ?? null,
        aliases: [t.symbol?.toLowerCase()].filter(Boolean) as string[],
      }));
    return NextResponse.json({ chainId: CHAIN_ID, tokens });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
