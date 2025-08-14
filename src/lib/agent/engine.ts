// src/lib/agent/engine.ts
import { findTokenAddress, symbolFor, readyTokens } from "@/lib/agent/tokens";

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
 * Async karena perlu resolve simbol via PiperX registry.
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

  // Pastikan registry PiperX ter-load (cached 5 menit)
  await readyTokens();

  // Resolve simbol/alias → address (atau langsung address)
  const aIn = await findTokenAddress(inSym);
  if (!aIn) return ask(`Token input "${inSym}" tidak dikenali.`);

  const aOut = await findTokenAddress(outSym);
  if (!aOut) return ask(`Token output "${outSym}" tidak dikenali.`);

  const [sIn, sOut] = await Promise.all([symbolFor(aIn), symbolFor(aOut)]);

  const plan = [
    `Parse: ${amount} ${sIn} → ${sOut}${
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
