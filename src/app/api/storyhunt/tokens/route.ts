// src/app/api/storyhunt/tokens/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * Ambil token list StoryHunt dari GitHub default-list.
 * Bisa override via ENV: STORYHUNT_TOKENLIST_URL
 * Default: https://raw.githubusercontent.com/0xstoryhunt/default-list/main/tokenlist.json
 */
const DEF_URL =
  "https://raw.githubusercontent.com/0xstoryhunt/default-list/main/tokenlist.json";
const SRC = (process.env.STORYHUNT_TOKENLIST_URL || DEF_URL).trim();

export async function GET(_req: NextRequest) {
  try {
    const r = await fetch(SRC, { cache: "no-store" });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return NextResponse.json(
        { error: `Upstream ${r.status}`, detail: t.slice(0, 200) },
        { status: 502 }
      );
    }
    const j = await r.json();

    // Normalisasi → { tokens: [{symbol,address,decimals,aliases?}] }
    const raw = Array.isArray(j?.tokens) ? j.tokens : Array.isArray(j) ? j : [];
    const tokens = raw
      .map((x: any) => ({
        symbol: String(x.symbol || x.ticker || "").toUpperCase(),
        address: String(x.address || x.tokenAddress || "").toLowerCase(),
        decimals: x.decimals ?? null,
        aliases: (x.aliases || x.tags || []).map((z: any) =>
          String(z).toLowerCase()
        ),
      }))
      .filter((t: any) => /^0x[0-9a-fA-F]{40}$/.test(t.address));
    return NextResponse.json({ tokens });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "token list error" },
      { status: 500 }
    );
  }
}
