// src/lib/abi/aggregator_abi.ts

// UniswapV2-like
export const aggregatorV2Abi = [
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

// Custom aggregator (generic)
export const aggregatorCustomAbi = [
  {
    name: "execute",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "route", type: "bytes" }],
    outputs: [],
  },
] as const;
