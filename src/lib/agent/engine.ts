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

export type RegisterIntent = {
  kind: "register";
  title?: string;
  prompt?: string; // free-form (mis. "by-nc", dsb)
};

type PlanOK = { type: "plan"; plan: string[]; intent: SwapIntent | RegisterIntent };

// ---------- Regex ----------
const RE_SWAP =
  /^\s*swap\s+([\d_,.]+)\s+([^\s>]+)\s*>\s*([^\s]+)(?:\s+slippage\s+([\d_,.]+)%?)?\s*$/i;

// cukup longgar: ada kata "register", "image", "ip"; title opsional dalam kutip
const RE_REGISTER = /\bregister\b.*\bimage\b.*\bip\b/i;
const RE_TITLE = /title\s+["“']([^"”']+)["”']/i;

const toNum = (s?: string) =>
  s ? Number(String(s).replace(/[,_]/g, ".").trim()) : NaN;

function ask(msg: string): Ask {
  return { type: "ask", question: msg };
}

/** Parse prompt → intent (swap atau register). */
export async function decide(text: string): Promise<Ask | PlanOK> {
  const t = text.trim();

  // ---------- 1) Coba parse SWAP ----------
  const ms = t.match(RE_SWAP);
  if (ms) {
    const amount = toNum(ms[1]);
    const inSym = ms[2];
    const outSym = ms[3];
    const slippage = ms[4] ? toNum(ms[4]) : 0.5;

    if (!isFinite(amount) || amount <= 0) {
      return ask("Jumlah swap tidak valid.");
    }

    // pastikan registry PiperX ter-load (cached)
    await readyTokens();

    const aIn = await findTokenAddress(inSym);
    if (!aIn) return ask(`Token input "${inSym}" tidak dikenali.`);

    const aOut = await findTokenAddress(outSym);
    if (!aOut) return ask(`Token output "${outSym}" tidak dikenali.`);

    const tokenIn = aIn as `0x${string}`;
    const tokenOut = aOut as `0x${string}`;
    const sIn = await symbolFor(tokenIn);
    const sOut = await symbolFor(tokenOut);

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
      tokenIn,
      tokenOut,
      slippagePct: isFinite(slippage) ? slippage : 0.5,
    };

    return { type: "plan", plan, intent };
  }

  // ---------- 2) Coba parse REGISTER ----------
  if (RE_REGISTER.test(t)) {
    const title = t.match(RE_TITLE)?.[1]; // "Sunset"
    // prompt bebas: potong bagian depan sampai setelah title (kalau ada)
    let promptFree = t;
    if (title) {
      promptFree = t.replace(RE_TITLE, "").trim();
    }
    // buang kata kunci register/image/ip agar prompt bersih
    promptFree = promptFree.replace(/register|image|ip|title/gi, "").trim();

    const plan = [
      "Optimasi & upload gambar ke IPFS",
      "Upload IP metadata",
      "Upload NFT metadata",
      "Mint & register IP di SPG collection",
      "Tampilkan tx hash & link explorer",
    ];

    const intent: RegisterIntent = {
      kind: "register",
      title,
      prompt: promptFree || undefined,
    };

    return { type: "plan", plan, intent };
  }

  // ---------- 3) Gagal keduanya ----------
  return ask(
    'Butuh token in (alamat/simbol), token out (alamat/simbol). Contoh: “Swap 1 WIP > USDC slippage 0.5%”.'
  );
}
