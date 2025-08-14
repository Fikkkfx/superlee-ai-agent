// src/lib/piperx.ts
// Adapter StoryHunt (drop-in pengganti piperx lama).
// Ekspor: getDecimals, getQuote, approveForAggregator, swapViaAggregator

import { erc20Abi } from "@/lib/abi/erc20";
import { createPublicClient, http } from "viem";
import { storyAeneid } from "@/lib/chains/story";
import { BrowserProvider, Contract } from "ethers";

// ==== ENV ====
// Baru (StoryHunt):
// - NEXT_PUBLIC_STORYHUNT_API_BASE        -> e.g. https://api.storyhunt.xyz
// - NEXT_PUBLIC_STORYHUNT_QUOTE_PATH      -> e.g. /dex/quote  (default '/dex/quote')
// - NEXT_PUBLIC_STORYHUNT_AGGREGATOR      -> alamat router/aggregator (spender & eksekusi)
//
// Lama (PiperX) — didukung sebagai fallback agar transisi aman:
// - NEXT_PUBLIC_PIPERX_AGGREGATOR_API     -> base URL lama (fallback API base)
// - NEXT_PUBLIC_PIPERX_AGGREGATOR         -> alamat aggregator lama (fallback)

const API_BASE =
  (process.env.NEXT_PUBLIC_STORYHUNT_API_BASE ||
    process.env.NEXT_PUBLIC_PIPERX_AGGREGATOR_API ||
    "").replace(/\/+$/, "");

const QUOTE_PATH = process.env.NEXT_PUBLIC_STORYHUNT_QUOTE_PATH || "/dex/quote";

const AGGREGATOR = (process.env.NEXT_PUBLIC_STORYHUNT_AGGREGATOR ||
  process.env.NEXT_PUBLIC_PIPERX_AGGREGATOR ||
  "") as `0x${string}`;

export const WIP = (process.env.NEXT_PUBLIC_STORYHUNT_WIP ||
  process.env.NEXT_PUBLIC_PIPERX_WIP ||
  "0x1514000000000000000000000000000000000000") as `0x${string}`;

const storyRpc =
  process.env.NEXT_PUBLIC_STORY_RPC ||
  (storyAeneid.rpcUrls as any).public?.http?.[0] ||
  (storyAeneid.rpcUrls as any).default?.http?.[0];

export const publicClient = createPublicClient({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chain: storyAeneid as any,
  transport: http(storyRpc),
});

// UniswapV2-like router ABI (default path)
const UNIV2_ROUTER_ABI = [
  {
    name: "swapExactTokensForTokens",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
] as const;

// Opsi aggregator custom (jika StoryHunt menyediakan eksekusi via bytes route)
const CUSTOM_AGGREGATOR_ABI = [
  {
    name: "execute",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "route", type: "bytes" }],
    outputs: [],
  },
] as const;

function ensureApiBase() {
  if (!API_BASE) {
    throw new Error(
      "StoryHunt API base tidak di-set. Tambahkan NEXT_PUBLIC_STORYHUNT_API_BASE di .env.local"
    );
  }
}
function ensureAggregator() {
  if (!AGGREGATOR) {
    throw new Error(
      "StoryHunt aggregator/router tidak di-set. Tambahkan NEXT_PUBLIC_STORYHUNT_AGGREGATOR di .env.local"
    );
  }
}

export async function getDecimals(token: `0x${string}`) {
  return await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "decimals",
  });
}

// Bentuk respons yang diseragamkan untuk FE:
export type QuoteResponse = {
  routeKind: "v2" | "custom";
  spender: `0x${string}`;
  // Jika v2:
  route?:
    | {
        path: `0x${string}`[];
        amountInRaw: string;
        minOutRaw: string;
        deadline: number;
      }
    | any;
  // Jika custom:
  routeBytes?: `0x${string}` | string;

  amountOutFormatted?: string;
  minAmountOutFormatted?: string;
  amountInRaw: string;
};

// Ambil jalur swap dari StoryHunt. Path endpoint fleksibel via ENV.
export async function getQuote({
  tokenIn,
  tokenOut,
  amountInRaw,
  slippagePct,
}: {
  tokenIn: string;
  tokenOut: string;
  amountInRaw: string;
  slippagePct?: number;
}): Promise<QuoteResponse> {
  ensureApiBase();
  const base = `${API_BASE}${QUOTE_PATH}`;
  const q = new URLSearchParams({
    tokenIn,
    tokenOut,
    amount: amountInRaw,
  });
  if (slippagePct != null && Number.isFinite(slippagePct)) {
    q.set("slippage", String(slippagePct));
  }

  const url = `${base}?${q.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Failed to fetch quote (${res.status}): ${t.slice(0, 160)}`);
  }
  const j = await res.json();

  // Jika backend sudah mengembalikan dalam bentuk standar kita, langsung return
  if (j && (j.routeKind === "v2" || j.routeKind === "custom")) {
    return j as QuoteResponse;
  }

  // Normalisasi dari kemungkinan bentuk umum:
  // Asumsi umum V2: { path, minOutRaw, deadline, amountOutFormatted, minAmountOutFormatted }
  if (Array.isArray(j?.path)) {
    return {
      routeKind: "v2",
      spender: AGGREGATOR,
      route: {
        path: j.path,
        amountInRaw,
        minOutRaw:
          j.minOutRaw || j.minAmountOutRaw || j.amountOutMin || "0",
        deadline:
          Number(j.deadline) ||
          Math.floor(Date.now() / 1000) + 60 * 20 /* 20m */,
      },
      amountOutFormatted: j.amountOutFormatted || j.expectedOut || "",
      minAmountOutFormatted:
        j.minAmountOutFormatted || j.minOutFormatted || "",
      amountInRaw,
    };
  }

  // Asumsi custom aggregator: { routeBytes, expectedOut, minOut }
  if (j?.routeBytes || j?.route || j?.data) {
    return {
      routeKind: "custom",
      spender: AGGREGATOR,
      routeBytes: (j.routeBytes || j.route || j.data) as string,
      amountOutFormatted: j.amountOutFormatted || j.expectedOut || "",
      minAmountOutFormatted: j.minAmountOutFormatted || j.minOut || "",
      amountInRaw,
    };
  }

  throw new Error("Unrecognized quote shape from StoryHunt API");
}

export async function approveForAggregator(token: `0x${string}`, amount: bigint) {
  ensureAggregator();
  const anyWindow = window as any;
  if (!anyWindow?.ethereum) throw new Error("Wallet not found");

  const provider = new BrowserProvider(anyWindow.ethereum);
  const signer = await provider.getSigner();
  const contract = new Contract(token, erc20Abi as any, signer);
  const tx = await contract.approve(AGGREGATOR, amount);
  return await tx.wait();
}

export async function swapViaAggregator(
  q: QuoteResponse,
  recipient?: `0x${string}`
) {
  ensureAggregator();
  const anyWindow = window as any;
  if (!anyWindow?.ethereum) throw new Error("Wallet not found");

  const provider = new BrowserProvider(anyWindow.ethereum);
  const signer = await provider.getSigner();
  const to = recipient || ((await signer.getAddress()) as `0x${string}`);

  if (q.routeKind === "custom") {
    const routeBytes = (q.routeBytes || "") as string;
    const contract = new Contract(AGGREGATOR, CUSTOM_AGGREGATOR_ABI as any, signer);
    const tx = await contract.execute(routeBytes);
    return await tx.wait();
  }

  // v2 default
  const r = q.route as QuoteResponse["route"] & {
    path: `0x${string}`[];
    amountInRaw: string;
    minOutRaw: string;
    deadline: number;
  };
  if (!r || !Array.isArray(r.path)) {
    throw new Error("Invalid V2 route");
  }

  const router = new Contract(AGGREGATOR, UNIV2_ROUTER_ABI as any, signer);
  const tx = await router.swapExactTokensForTokens(
    r.amountInRaw,
    r.minOutRaw,
    r.path,
    to,
    r.deadline
  );
  return await tx.wait();
}
