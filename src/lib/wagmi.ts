// src/lib/wagmi.ts
import { createConfig, http } from "wagmi";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  walletConnectWallet,
  coinbaseWallet,
  rabbyWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { storyAeneid } from "@/lib/chains/story";

// WalletConnect Project ID (set di .env lokal & Vercel)
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_ID ?? "demo";

// RPC Story (boleh override)
const rpcUrl =
  process.env.NEXT_PUBLIC_RPC_URL ||
  storyAeneid.rpcUrls?.default?.http?.[0] ||
  "https://aeneid.storyrpc.io";

// ✅ RainbowKit v2: pass fungsi wallet (CreateWalletFn), bukan hasil pemanggilan
const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [
        injectedWallet,
        rabbyWallet,
        coinbaseWallet,
        walletConnectWallet,
      ],
    },
  ],
  {
    appName: "Superlee AI Agent",
    projectId,
  }
);

// Wagmi config
export const wagmiConfig = createConfig({
  chains: [storyAeneid],
  connectors,
  transports: {
    [storyAeneid.id]: http(rpcUrl),
  },
  ssr: true,
});
