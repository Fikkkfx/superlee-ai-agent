// src/lib/swapper.ts
import {
  getDecimals,
  getQuote,
  swapViaAggregator,
  type QuoteResponse,
} from "@/lib/storyhunt";
import { createPublicClient, http, erc20Abi } from "viem";
import { storyAeneid } from "@/lib/chains/story";

const storyRpc =
  process.env.NEXT_PUBLIC_STORY_RPC ||
  (storyAeneid.rpcUrls as any).public?.http?.[0] ||
  (storyAeneid.rpcUrls as any).default?.http?.[0];

export const pc = createPublicClient({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chain: storyAeneid as any,
  transport: http(storyRpc),
});

export async function previewSwap(args: {
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amount: string; // human
  slippagePct?: number;
}) {
  const [decIn, decOut] = await Promise.all([
    getDecimals(args.tokenIn),
    getDecimals(args.tokenOut),
  ]);
  const amountInRaw = toAmountRaw(args.amount, decIn);
  const q = await getQuote({
    tokenIn: args.tokenIn,
    tokenOut: args.tokenOut,
    amountInRaw,
    slippagePct: args.slippagePct,
  });
  return {
    ...q,
    amountInRaw,
    amountOutFormatted: q.amountOutFormatted || "",
    minAmountOutFormatted: q.minAmountOutFormatted || "",
  };
}

export async function ensureSufficientBalance(params: {
  publicClient: any;
  owner: `0x${string}`;
  token: `0x${string}`;
  amountRaw: bigint | string;
}) {
  const amountRaw =
    typeof params.amountRaw === "bigint"
      ? params.amountRaw
      : BigInt(params.amountRaw);
  // Cek ERC20 balance
  const bal: bigint = await params.publicClient.readContract({
    address: params.token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [params.owner],
  });
  if (bal < amountRaw) {
    throw new Error(
      `Insufficient balance: need ${amountRaw.toString()}, have ${bal.toString()}`
    );
  }
}

export async function approveIfNeeded(params: {
  publicClient: any;
  owner: `0x${string}`;
  token: `0x${string}`;
  amountRaw: bigint | string;
  spender: `0x${string}`;
}) {
  // allowance
  const allowance: bigint = await params.publicClient.readContract({
    address: params.token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [params.owner, params.spender],
  });
  const need =
    typeof params.amountRaw === "bigint"
      ? params.amountRaw
      : BigInt(params.amountRaw);
  if (allowance >= need) return; // sudah cukup

  // Approve via wallet (pakai fungsi dari adapter — di luar sini)
  // Biar aman, kita biarkan FE yang memanggil approveForAggregator(token, amount)
  // karena perlu signer. Kalau kamu mau one-stop, impor approveForAggregator di sini.
}

export async function executeSwap(q: QuoteResponse) {
  // Eksekusi via adapter (menangani v2/custom)
  const tx = await swapViaAggregator(q);
  return tx;
}

// ---- helpers ----
function toAmountRaw(human: string, decimals: number): string {
  const [intPart, fracPart = ""] = String(human).split(".");
  const cleanFrac = fracPart.replace(/\D/g, "").slice(0, decimals);
  const padded = cleanFrac.padEnd(decimals, "0");
  return bigintStr(`${intPart.replace(/\D/g, "")}${padded}`).toString();
}
function bigintStr(s: string): bigint {
  const clean = s.replace(/^0+/, "") || "0";
  return BigInt(clean);
}
