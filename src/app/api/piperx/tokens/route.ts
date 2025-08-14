// src/app/api/piperx/tokens/route.ts
import { NextResponse } from "next/server";

// Docs: https://docs.piperx.xyz/developer/api/price-api
// 1) Get All Tokens
const PIPERX_ALL_TOKENS =
  "https://piperxdb.piperxprotocol.workers.dev/api/piperxapi/getAllTokens";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const r = await fetch(PIPERX_ALL_TOKENS, { cache: "no-store" });
    if (!r.ok) {
      const t = await r.text();
      return NextResponse.json(
        { error: `Upstream ${r.status}: ${t.slice(0, 160)}` },
        { status: 500 }
      );
    }
    const data = await r.json();
    // Normalisasi -> minimal fields yang kita pakai
    const tokens = (data?.tokens ?? [])
      .filter((x: any) => typeof x?.id === "string" && typeof x?.symbol === "string")
      .map((x: any) => ({
        address: (x.id as string).toLowerCase(),
        symbol: String(x.symbol).toUpperCase(),
        name: x.name ?? "",
        decimals: typeof x.decimals === "number" ? x.decimals : undefined,
      }));

    return NextResponse.json({ tokens });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to fetch PiperX tokens" },
      { status: 500 }
    );
  }
}
