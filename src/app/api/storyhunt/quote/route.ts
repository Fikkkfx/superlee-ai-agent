// src/app/api/storyhunt/quote/route.ts
import { NextResponse } from "next/server";

const AGG_BASE =
  process.env.STORYHUNT_API ||
  process.env.NEXT_PUBLIC_STORYHUNT_API ||
  // fallback: kalau kamu masih taruh di var lama, tetap kebaca
  process.env.NEXT_PUBLIC_PIPERX_AGGREGATOR_API ||
  "";

function buildUpstreamUrl(q: URLSearchParams) {
  const tokenIn = q.get("tokenIn");
  const tokenOut = q.get("tokenOut");
  const amount = q.get("amount");
  const type = q.get("type") || "exactInput"; // default
  if (!AGG_BASE) throw new Error("Missing STORYHUNT_API base URL");
  if (!tokenIn || !tokenOut || !amount) throw new Error("Missing query params");

  // Sesuaikan path dengan dok resmi StoryHunt.
  // Contoh kompatibel (mirip PiperX) – ganti jika dok StoryHunt beda:
  return `${AGG_BASE}/api/swap/swapExactToken?tokenIn=${tokenIn}&tokenOut=${tokenOut}&amount=${amount}&type=${type}&isAggregator=true`;
}

async function fetchWithRetry(url: string, tries = 2) {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12_000);
    try {
      const r = await fetch(url, { signal: controller.signal, cache: "no-store" });
      clearTimeout(t);
      if (r.ok) return r.json();
      lastErr = new Error(`Upstream ${r.status}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const upstream = buildUpstreamUrl(url.searchParams);
    const raw = await fetchWithRetry(upstream, 2);

    // Normalisasi respons -> bentuk yang FE butuh
    // FE kamu sebelumnya pakai: { universalRoutes, spender, amountOutRaw, minAmountOutRaw }
    const normalized = {
      universalRoutes: raw.universalRoutes || raw.routes || raw.route || [],
      spender: raw.spender || process.env.NEXT_PUBLIC_PIPERX_AGGREGATOR || process.env.NEXT_PUBLIC_STORYHUNT_AGGREGATOR,
      amountOutRaw: String(raw.amountOut || raw.amountOutRaw || raw.expectedOut || "0"),
      minAmountOutRaw: String(
        raw.minAmountOut || raw.minAmountOutRaw || raw.minOut || raw.expectedMinOut || "0"
      ),
    };

    return NextResponse.json(normalized);
  } catch (e) {
    console.error("[storyhunt/quote] fail:", e);
    // Penting: balas 200 + payload error yang jelas agar FE bisa render pesan,
    // bukan 502 yang bikin blank.
    return NextResponse.json(
      { error: "QUOTE_UPSTREAM_FAIL", message: (e as Error).message || String(e) },
      { status: 200 }
    );
  }
}
