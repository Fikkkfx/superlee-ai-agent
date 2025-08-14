// src/lib/agent/engine.ts
import { readyTokens, findTokenAddress, symbolFor } from "@/lib/agent/tokens";

/* ---------- types ---------- */
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
  prompt?: string;   // bisa dipakai sebagai deskripsi/prompt AI
  license?: string;  // mis. "by-nc"
  allowDuplicates?: boolean;
};

type PlanOK = { type: "plan"; plan: string[]; intent: SwapIntent | RegisterIntent };

/* ---------- regex ---------- */
const RE_SWAP =
  /^\s*swap\s+([\d_,.]+)\s+([^\s>]+)\s*>\s*([^\s]+)(?:\s+slippage\s+([\d_,.]+)%?)?\s*$/i;

const toNum = (s?: string) =>
  s ? Number(String(s).replace(/[,_]/g, ".").trim()) : NaN;

function ask(msg: string): Ask {
  return { type: "ask", question: msg };
}

/* ---------- register parser ---------- */
function parseRegister(t: string): RegisterIntent | null {
  // terima variasi: register this image ip, title "Sunset" by-nc
  //                 register image ip title Sunset
  //                 register ip title "My Work"
  if (!/^ *register\b/i.test(t)) return null;

  const titleInQuotes = t.match(/title\s+["“”'']([^"“”']+)["“”'']/i)?.[1];
  const titleBare = titleInQuotes
    ? undefined
    : t.match(/title\s+([^\n,]+?)(?:\s+by-[a-z0-9-]+|\s*$)/i)?.[1];

  const license = t.match(/\bby-[a-z0-9-]+\b/i)?.[0]?.toLowerCase();

  const title = (titleInQuotes || titleBare || "").trim() || undefined;

  return {
    kind: "register",
    title,
    prompt: t,          // biar ikut tersimpan sebagai deskripsi/prompt
    license,
    allowDuplicates: true,
  };
}

/* ---------- main decide (async) ---------- */
export async function decide(text: string): Promise<Ask | PlanOK> {
  const input = text.trim();

  // 1) Coba parse REGISTER dulu supaya tidak jatuh ke fallback swap error
  const reg = parseRegister(input);
  if (reg) {
    const pretty = [
      `Register IP${reg.title ? `, title "${reg.title}"` : ""}`,
      reg.license ? `license ${reg.license}` : "",
    ]
      .filter(Boolean)
      .join(" ");

    const plan = [
      `Parse: ${pretty || "Register IP"}`,
      "Optimizing image",
      "Upload image ke IPFS",
      "Upload IP metadata",
      "Upload NFT metadata",
      "Submit tx: mint & register IP",
      "Tampilkan tx hash & link explorer",
    ];
    return { type: "plan", plan, intent: reg };
  }

  // 2) Coba parse SWAP
  const m = input.match(RE_SWAP);
  if (!m) {
    return ask(
      'Perintah tidak dikenali. Contoh:\n• Swap:  "Swap 1 WIP > USDC slippage 0.5%"\n• Register: "Register this image IP, title \\"Sunset\\" by-nc"'
    );
  }

  const amount = toNum(m[1]);
  const inSym = m[2];
  const outSym = m[3];
  const slippage = m[4] ? toNum(m[4]) : 0.5;

  if (!isFinite(amount) || amount <= 0) {
    return ask("Jumlah swap tidak valid.");
  }

  // Pastikan registry StoryHunt/ENV sudah siap
  await readyTokens();

  // resolve simbol/alamat
  const aIn = await findTokenAddress(inSym);
  if (!aIn) return ask(`Token input "${inSym}" tidak dikenali.`);
  const aOut = await findTokenAddress(outSym);
  if (!aOut) return ask(`Token output "${outSym}" tidak dikenali.`);

  const [sIn, sOut] = await Promise.all([symbolFor(aIn), symbolFor(aOut)]);

  const plan = [
    `Parse: ${amount} ${sIn} → ${sOut}${
      isFinite(slippage) ? ` (slippage ${slippage}%)` : ""
    }`,
    "Ambil quote dari Aggregator",
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
