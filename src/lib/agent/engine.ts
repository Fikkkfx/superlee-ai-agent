// src/lib/agent/engine.ts
import {
  findTokenAddress,
  findTokenAddressAsync,
  symbolFor,
  loadPiperxRegistry,
} from "./tokens";

type Ask = { type: "ask"; question: string };

export type SwapIntent = {
  kind: "swap";
  amount: number;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  slippagePct: number;
};

type PlanOK = { type: "plan"; plan: string[]; intent: SwapIntent };

const RE_SWAP =
  /^\s*swap\s+([\d_,.]+)\s+([^\s>]+)\s*>\s*([^\s]+)(?:\s+slippage\s+([\d_,.]+)%?)?\s*$/i;

const toNum = (s?: string) =>
  s ? Number(String(s).replace(/[,_]/g, ".").trim()) : NaN;

function ask(msg: string): Ask {
  return { type: "ask", question: msg };
}

/**
 * Parse prompt user → intent swap.
 * Kini ASINKRON, agar bisa resolve simbol token dari PiperX registry.
 */
export async function decide(text: string): Promise<Ask | PlanOK> {
  const t = text.trim();
  const m = t.match(RE_SWAP);
  if (!m) {
    return ask(
      'Butuh token in (alamat/simbol), token out (alamat/simbol). Contoh: “Swap 1 WIP > USDC slippage 0.5%”.'
    );
  }

  const amount = toNum(m[1]);
  const inSym = m[2];
  const outSym = m[3];
  const slippage = m[4] ? toNum(m[4]) : 0.5;

  if (!isFinite(amount) || amount <= 0) {
    return ask("Jumlah swap tidak valid.");
  }

  // Pastikan registry PiperX tersedia (akan cache 5 menit)
  await loadPiperxRegistry().catch(() => {});

  // Coba resolve via registry; fallback ke ENV bila belum ada
  let aIn = await findTokenAddressAsync(inSym);
  if (!aIn) aIn = findTokenAddress(inSym);
  let aOut = await findTokenAddressAsync(outSym);
  if (!aOut) aOut = findTokenAddress(outSym);

  if (!aIn) return ask(`Token input "${inSym}" tidak dikenali.`);
  if (!aOut) return ask(`Token output "${outSym}" tidak dikenali.`);

  const plan = [
    `Parse: ${amount} ${symbolFor(aIn)} → ${symbolFor(aOut)}${
      isFinite(slippage) ? ` (slippage ${slippage}%)` : ""
    }`,
    "Ambil quote dari PiperX Aggregator",
    "Approve token in (jika perlu)",
    "Eksekusi swap via Aggregator",
    "Tampilkan tx hash & link explorer",
  ];

  const intent: SwapIntent = {
    kind: "swap",
    amount,
    tokenIn: aIn,
    tokenOut: aOut,
    slippagePct: isFinite(slippage) ? slippage : 0.5,
  };

  return { type: "plan", plan, intent };
}
