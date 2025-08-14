// src/app/api/piperx/tokens/route.ts
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const chainId =
    searchParams.get("chainId") ||
    process.env.NEXT_PUBLIC_CHAIN_ID ||
    "1315";

  // Set salah satu:
  // - PIPERX_API_BASE (server-only)  atau
  // - NEXT_PUBLIC_PIPERX_API_BASE (boleh dipakai juga)
  const base =
    process.env.PIPERX_API_BASE ||
    process.env.NEXT_PUBLIC_PIPERX_API_BASE ||
    "";

  if (!base) {
    // tidak fatal: biar fallback ENV jalan
    return Response.json([], { status: 200 });
  }

  const upstream = `${base.replace(/\/$/, "")}/tokens?chainId=${chainId}`;

  try {
    const r = await fetch(upstream, {
      headers: { accept: "application/json" },
      // no cache supaya daftar token selalu fresh
      cache: "no-store",
    });
    if (!r.ok) {
      return Response.json({ error: `upstream ${r.status}` }, { status: 502 });
    }
    const data = await r.json();
    return Response.json(data, { status: 200 });
  } catch (e: any) {
    return Response.json({ error: e?.message || "fetch failed" }, { status: 500 });
  }
}
