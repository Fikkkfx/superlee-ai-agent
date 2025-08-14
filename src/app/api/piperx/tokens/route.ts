import { NextResponse } from "next/server";

export const revalidate = 300; // 5 minutes

export async function GET() {
  try {
    const base = process.env.NEXT_PUBLIC_PIPERX_AGGREGATOR_API || "https://api.piperx.xyz";
    const chainId = Number(process.env.NEXT_PUBLIC_STORY_CHAIN_ID || 1315);
    const url = `${base.replace(/\/+$/, "")}/v1/tokens?chainId=${chainId}`;

    const r = await fetch(url, { next: { revalidate } });
    if (!r.ok) return NextResponse.json({ tokens: [] }, { status: 200 });

    const data = await r.json();
    const tokens = Array.isArray(data) ? data : data?.tokens || [];
    return NextResponse.json({ tokens });
  } catch {
    return NextResponse.json({ tokens: [] }, { status: 200 });
  }
}
