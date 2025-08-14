import { erc20Abi, type Address, formatUnits, parseUnits } from "viem";
import { getDecimals, getQuote, approveForAggregator, swapViaAggregator } from "@/lib/piperx";

export type SwapPreview = {
  amountInRaw: bigint;
  amountOutRaw: bigint;
  minAmountOutRaw: bigint;
  amountOutFormatted?: string;
  minAmountOutFormatted?: string;
  spender?: Address;
  route: any;
};

function toBps(pct: number) {
  // 0.5% -> 50 bps
  return BigInt(Math.round(pct * 100));
}

export async function ensureSufficientBalance(params: {
  publicClient: any;         // viem PublicClient
  owner: Address;
  token: Address;            // kalau native, panggilan ERC20 akan throw dan kita fallback ke native
  amountRaw: bigint;
}) {
  const { publicClient, owner, token, amountRaw } = params;
  try {
    const bal = (await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
    })) as bigint;
    if (bal < amountRaw) {
      throw new Error("Insufficient token balance");
    }
  } catch {
    // kemungkinan tokenIn adalah native → cek native balance
    const bal = await publicClient.getBalance({ address: owner });
    if (bal < amountRaw) throw new Error("Insufficient native balance");
  }
}

export async function previewSwap(params: {
  tokenIn: Address;
  tokenOut: Address;
  amount: string | number; // human readable
  slippagePct: number;     // misal 0.5
}) : Promise<SwapPreview> {
  const { tokenIn, tokenOut, amount, slippagePct } = params;

  const decIn = await getDecimals(tokenIn);
  const decOut = await getDecimals(tokenOut);

  const amountInRaw = parseUnits(String(amount), decIn);

  const q: any = await getQuote({
    tokenIn,
    tokenOut,
    amountInRaw: amountInRaw.toString(),
    slippagePct,
  });

  const outRaw: bigint =
    BigInt(q.amountOutRaw ?? q.amountOut ?? q.quote?.amountOutRaw ?? 0n);

  const bps = toBps(slippagePct);
  const minOutRaw = (outRaw * (10000n - bps)) / 10000n;

  return {
    amountInRaw,
    amountOutRaw: outRaw,
    minAmountOutRaw: minOutRaw,
    amountOutFormatted: formatUnits(outRaw, decOut),
    minAmountOutFormatted: formatUnits(minOutRaw, decOut),
    spender: (q.spender || q.allowanceTarget) as Address | undefined,
    route: q.universalRoutes ?? q.route ?? q,
  };
}

export async function approveIfNeeded(params: {
  publicClient: any;
  owner: Address;
  token: Address;
  amountRaw: bigint;
  spender?: Address;
}) {
  const { publicClient, owner, token, amountRaw, spender } = params;

  // kalau tidak ada info spender dari quote, gunakan helper aggregator
  if (!spender) {
    await approveForAggregator(token, amountRaw);
    return;
  }

  // cek allowance (jika tokenIn ERC20)
  try {
    const allowance = (await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner, spender],
    })) as bigint;

    if (allowance < amountRaw) {
      await approveForAggregator(token, amountRaw);
    }
  } catch {
    // kemungkinan tokenIn native / non ERC20 → tidak perlu approve
  }
}

export async function executeSwap(route: any) {
  // delegasikan ke helper aggregator
  const tx = await swapViaAggregator(route);
  return tx;
}
