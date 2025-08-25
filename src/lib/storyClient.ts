"use client";

import { useMemo } from "react";
import { useWalletClient } from "wagmi";
import { custom } from "viem";
import { StoryClient, type StoryConfig } from "@story-protocol/core-sdk";

/**
 * Story SDK terikat ke chain Aeneid (testnet).
 * Saat production, ganti chainId ke "mainnet" + RPC yang sesuai.
 */
export function useStoryClient() {
  const { data: wallet } = useWalletClient();

  const client = useMemo(() => {
    if (!wallet) return null;

    const cfg: StoryConfig = {
      // penting: pakai account + transport dari wagmi
      account: wallet.account,
      transport: custom(wallet.transport),
      chainId: "aeneid", // "mainnet" saat rilis
    } as any;

    return StoryClient.newClient(cfg);
  }, [wallet]);

  return {
    async getClient() {
      if (!client) throw new Error("Wallet not connected");
      return client;
    },
  };
}
