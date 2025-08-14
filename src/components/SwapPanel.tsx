"use client";
import { useAccount } from "wagmi";
import { useState } from "react";
import { parseUnits } from "viem";
import { getDecimals, getQuote, approveForAggregator, swapViaAggregator, WIP } from "@/lib/storyhunt";

export default function SwapPanel() {
  const { isConnected } = useAccount();
  const [tokenIn, setTokenIn] = useState<string>(process.env.NEXT_PUBLIC_DEFAULT_TOKEN_IN || WIP);
  const [tokenOut, setTokenOut] = useState<string>(process.env.NEXT_PUBLIC_DEFAULT_TOKEN_OUT || "");
  const [amount, setAmount] = useState<string>("");
  const [quote, setQuote] = useState<any>(null);
  const [status, setStatus] = useState<string>("");

  async function onQuote() {
    try {
      setStatus("Fetching quote...");
      const dec = await getDecimals(tokenIn as `0x${string}`);
      const amountRaw = parseUnits(amount || "0", dec).toString();
      const q = await getQuote({ tokenIn, tokenOut, amountInRaw: amountRaw });
      setQuote(q);
      setStatus("Quote loaded");
    } catch (e: any) {
      setStatus(e?.message || "Quote error");
    }
  }

  async function onApproveAndSwap() {
    try {
      if (!quote) return;
      const dec = await getDecimals(tokenIn as `0x${string}`);
      const amountRaw = parseUnits(amount || "0", dec);
      setStatus("Approving...");
      await approveForAggregator(tokenIn as `0x${string}`, amountRaw);
      setStatus("Swapping...");
      const tx = await swapViaAggregator(quote.universalRoutes);
      setStatus(`Swapped! Tx: ${tx.hash}`);
    } catch (e: any) {
      setStatus(e?.message || "Swap error");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3">
        <div>
          <label>Token In (ERC-20 address, use WIP for IP):</label>
          <input value={tokenIn} onChange={(e)=>setTokenIn(e.target.value)} placeholder="0x..." className="w-full"/>
        </div>
        <div>
          <label>Token Out (ERC-20 address):</label>
          <input value={tokenOut} onChange={(e)=>setTokenOut(e.target.value)} placeholder="0x..." className="w-full"/>
        </div>
        <div>
          <label>Amount</label>
          <input value={amount} onChange={(e)=>setAmount(e.target.value)} placeholder="0.1" className="w-full"/>
        </div>
        <div className="flex gap-2">
          <button onClick={onQuote} disabled={!isConnected}>Get Quote</button>
          <button onClick={onApproveAndSwap} disabled={!isConnected || !quote}>Approve & Swap</button>
        </div>
      </div>

      {status && <p className="text-sm text-gray-600">{status}</p>}

      {quote && (
        <pre className="bg-gray-50 p-3 rounded-xl overflow-auto text-xs">
{JSON.stringify(quote, null, 2)}
        </pre>
      )}
    </div>
  );
}