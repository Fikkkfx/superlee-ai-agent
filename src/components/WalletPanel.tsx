"use client";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { formatUnits, createPublicClient, http } from "viem";
import { storyAeneid } from "@/lib/chains/story";
import { erc20Abi } from "@/lib/abi/erc20";
import { erc721Abi } from "@/lib/abi/erc721";
import { WIP } from "@/lib/constants";


const SPG_COLLECTION =
  (process.env.NEXT_PUBLIC_SPG_COLLECTION as `0x${string}`) ||
  "0xc32A8a0FF3beDDDa58393d022aF433e78739FAbc";

const publicClient = createPublicClient({
  chain: storyAeneid,
  transport: http(process.env.NEXT_PUBLIC_STORY_RPC),
});

export default function WalletPanel() {
  const { isConnected, address } = useAccount();
  const [ipBalance, setIpBalance] = useState<string>("-");
  const [wipBalance, setWipBalance] = useState<string>("-");
  const [ipCount, setIpCount] = useState<string>("-");

  useEffect(() => {
    if (!isConnected || !address) return;

    (async () => {
      // Native IP
      const nativeBal = await publicClient.getBalance({ address });
      setIpBalance(formatUnits(nativeBal, 18));

      // WIP (ERC-20)
      const [decimals, wRaw] = await Promise.all([
        publicClient.readContract({
          address: WIP,
          abi: erc20Abi,
          functionName: "decimals",
        }) as Promise<number>,
        publicClient.readContract({
          address: WIP,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        }) as Promise<bigint>,
      ]);
      setWipBalance(formatUnits(wRaw, Number(decimals)));

      // Total IP (jumlah NFT di koleksi SPG)
      const count = (await publicClient.readContract({
        address: SPG_COLLECTION,
        abi: erc721Abi,
        functionName: "balanceOf",
        args: [address],
      })) as bigint;

      setIpCount(count.toString());
    })();
  }, [isConnected, address]);

  if (!isConnected) return null;

  return (
    <div className="card">
      <div className="text-sm text-white/70 mb-2">Wallet Overview</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        <div className="rounded-xl bg-white/5 border border-white/10 p-3">
          <div className="text-white/60">IP (native)</div>
          <div className="text-lg font-semibold">{ipBalance}</div>
        </div>
        <div className="rounded-xl bg-white/5 border border-white/10 p-3">
          <div className="text-white/60">WIP (ERC-20)</div>
          <div className="text-lg font-semibold">{wipBalance}</div>
        </div>
        <div className="rounded-xl bg-white/5 border border-white/10 p-3">
          <div className="text-white/60">Total IP Registered</div>
          <div className="text-lg font-semibold">{ipCount}</div>
        </div>
      </div>
    </div>
  );
}
