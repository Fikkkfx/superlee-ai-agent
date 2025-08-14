const KNOWN = {
  WIP: (process.env.NEXT_PUBLIC_STORYHUNT_WIP || "0x1514000000000000000000000000000000000000") as `0x${string}`,
  USDC: "", USDT: "",
};

const STORYHUNT_API = process.env.NEXT_PUBLIC_STORYHUNT_API!; // kalau kamu pakai base URL
export const TOKENS_URL = "/api/storyhunt/tokens";

export function resolveToken(t?: string): string | null {
  if (!t) return null;
  const v = t.trim();
  if (v.startsWith("0x") && v.length === 42) return v;
  const key = v.toUpperCase();
  // @ts-ignore
  return KNOWN[key] ?? key;
}
export function parseAmount(text: string): number | null {
  const m = text.replace(",", ".").match(/\b(\d+(?:\.\d+)?)\b/);
  return m ? Number(m[1]) : null;
}
