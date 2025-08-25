import { defineChain } from "viem";

export const storyAeneid = defineChain({
  id: 1315,
  name: "Story Aeneid Testnet",
  nativeCurrency: { name: "IP", symbol: "IP", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_STORY_RPC || "https://aeneid.storyrpc.io"] } },
  blockExplorers: { default: { name: "StoryScan", url: "https://aeneid.storyscan.xyz" } },
});

export const storyMainnet = defineChain({
  id: 1514,
  name: "Story",
  nativeCurrency: { name: "IP", symbol: "IP", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.storyrpc.io"] } },
  blockExplorers: { default: { name: "StoryScan", url: "https://mainnet.storyscan.xyz" } },
});