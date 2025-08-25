// Single place for chain constants you need across the app
export const WIP = (
  process.env.NEXT_PUBLIC_STORYHUNT_WIP ||
  // Wrapped IP on Aeneid (keep your known default here)
  "0x1514000000000000000000000000000000000000"
) as `0x${string}`;
