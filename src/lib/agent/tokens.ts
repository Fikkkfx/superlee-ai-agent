// src/lib/agent/tokens.ts
export type TokenEntry = {
  symbol: string;
  address: `0x${string}`;
  decimals?: number | null;
  aliases?: string[];
};

const isAddr = (s: string): s is `0x${string}` => /^0x[0-9a-fA-F]{40}$/.test(s);
const env = (k: string) => (process.env[k] || "").trim();

// ===== ENV fallback (agar tetap jalan saat API down) =====
const ENV_TOKENS: TokenEntry[] = [];
{
  const wip = env("NEXT_PUBLIC_STORYHUNT_WIP") || env("NEXT_PUBLIC_PIPERX_WIP");
  if (isAddr(wip))
    ENV_TOKENS.push({
      symbol: "WIP",
      address: wip as `0x${string}`,
      aliases: ["ip", "wip", "native", "wrapped ip"],
    });

  const usdc = env("NEXT_PUBLIC_TOKEN_USDC");
  if (isAddr(usdc))
    ENV_TOKENS.push({
      symbol: "USDC",
      address: usdc as `0x${string}`,
      aliases: ["usdc", "usd c", "stable", "dollar"],
    });

  const weth = env("NEXT_PUBLIC_TOKEN_WETH");
  if (isAddr(weth))
    ENV_TOKENS.push({
      symbol: "WETH",
      address: weth as `0x${string}`,
      aliases: ["eth", "weth", "wrapped eth"],
    });
}

// ===== Cache dari API (StoryHunt default-list via /api/storyhunt/tokens) =====
let loadedAt = 0;
let mapBySymbol = new Map<string, TokenEntry>(); // key: symbol/alias (lower)
let mapByAddr = new Map<string, TokenEntry>(); // key: address (lower)
const TTL_MS = 5 * 60 * 1000;

function indexToken(t: TokenEntry) {
  mapByAddr.set(t.address.toLowerCase(), t);
  mapBySymbol.set(t.symbol.toLowerCase(), t);
  for (const a of t.aliases || []) {
    mapBySymbol.set(String(a).toLowerCase(), t);
  }
}

/** Muat token registry dari StoryHunt + ENV fallback. Cache 5 menit. */
export async function loadPiperxRegistry(force = false) {
  if (!force && Date.now() - loadedAt < TTL_MS && mapByAddr.size > 0) return;
  mapByAddr = new Map();
  mapBySymbol = new Map();

  // muat ENV dulu supaya tetap ada minimal set
  for (const t of ENV_TOKENS) indexToken(t);

  try {
    const r = await fetch("/api/storyhunt/tokens", { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      const arr: TokenEntry[] = Array.isArray(j.tokens) ? j.tokens : [];
      for (const t of arr) {
        indexToken({
          symbol: String(t.symbol || "").toUpperCase(),
          address: t.address as `0x${string}`,
          decimals: t.decimals ?? null,
          aliases: (t.aliases || []).map((x: string) => String(x).toLowerCase()),
        });
      }
    }
  } catch {
    // ignore: tetap pakai ENV saja
  }

  loadedAt = Date.now();
}

export async function readyTokens() {
  await loadPiperxRegistry(false);
}

export function findTokenAddress(input: string): `0x${string}` | null {
  const s = (input || "").trim();
  if (!s) return null;
  if (isAddr(s)) return s as `0x${string}`;
  const hit = mapBySymbol.get(s.toLowerCase());
  return hit ? hit.address : null;
}

export function symbolFor(address: string): string {
  const t = mapByAddr.get(address.toLowerCase());
  return t?.symbol || address;
}
