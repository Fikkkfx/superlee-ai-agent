// src/app/api/storyhunt/tokens/route.ts
import { NextResponse } from "next/server";

const TOKENLIST_URL =
  process.env.STORYHUNT_TOKENLIST_URL ||
  // default list resmi StoryHunt (raw GitHub)
  "https://raw.githubusercontent.com/0xstoryhunt/default-list/main/storyhunt.tokenlist.json";

// Fallback ENV tokens supaya UI tetap jalan kalau upstream 5xx
function envTokens() {
  const out: Array<{symbol:string;address:string;decimals?:number;aliases?:string[]}> = [];
  const push = (sym: string, addr?: string | null, aliases: string[] = [], decimals?: number) => {
    if (addr && /^0x[a-fA-F0-9]{40}$/.test(addr)) out.push({ symbol: sym, address: addr, aliases, decimals });
  };
  push("WIP", process.env.NEXT_PUBLIC_STORYHUNT_WIP, ["ip","wip","native"]);
  push("USDC", process.env.NEXT_PUBLIC_TOKEN_USDC, ["usdc","usd c","stable"]);
  push("WETH", process.env.NEXT_PUBLIC_TOKEN_WETH, ["eth","weth","wrapped eth"]);
  return out;
}

export async function GET() {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 10_000); // 10s timeout
  try {
    const r = await fetch(TOKENLIST_URL, {
      // cache 1 jam biar hemat
      next: { revalidate: 3600 },
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`Upstream tokenlist ${r.status}`);
    const j = await r.json();

    // Normalisasi -> {symbol,address,decimals,aliases}
    const tokens = Array.isArray(j?.tokens)
      ? j.tokens.map((t: any) => ({
          symbol: String(t.symbol || "").toUpperCase(),
          address: String(t.address || ""),
          decimals: typeof t.decimals === "number" ? t.decimals : undefined,
          aliases: Array.isArray(t.aliases) ? t.aliases.map((x: string) => x.toLowerCase()) : [],
        }))
      : [];

    // Gabungkan ENV fallback agar pasti ada minimal 1–2 token
    const mergedMap = new Map<string, any>();
    for (const x of [...envTokens(), ...tokens]) {
      const k = (x.address || "").toLowerCase();
      if (k) mergedMap.set(k, x);
    }
    const merged = [...mergedMap.values()];
    return NextResponse.json({ tokens: merged });
  } catch (e) {
    console.error("[storyhunt/tokens] fail:", e);
    // Tetap balikin ENV tokens agar FE tidak 502/blank
    return NextResponse.json({ tokens: envTokens() }, { status: 200 });
  } finally {
    clearTimeout(t);
  }
}
