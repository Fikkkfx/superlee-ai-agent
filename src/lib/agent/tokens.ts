// src/lib/agent/tokens.ts
export type TokenEntry = {
  symbol: string;
  address: `0x${string}`;
  decimals?: number | null;
  aliases?: string[]; // lowercase
};

const isAddr = (s: string): s is `0x${string}` => /^0x[0-9a-fA-F]{40}$/.test(s);
const env = (k: string) => (process.env[k] || "").trim();

// ===== ENV fallback (opsional, supaya tetap jalan kalau API down) =====
const ENV_TOKENS: TokenEntry[] = [];
{
  const wip = env("NEXT_PUBLIC_PIPERX_WIP");
  if (isAddr(wip))
    ENV_TOKENS.push({
      symbol: "WIP",
      address: wip as `0x${string}`,
      aliases: ["ip", "wip", "native"],
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

// ===== Cache dari API PiperX =====
let loadedAt = 0;
let mapBySymbol = new Map<string, TokenEntry>(); // key: lower symbol/alias
let mapByAddr = new Map<string, TokenEntry>();   // key: lower address
const TTL_MS = 5 * 60 * 1000;

function indexToken(t: TokenEntry) {
  mapByAddr.set(t.address.toLowerCase(), t);
  mapBySymbol.set(t.symbol.toLowerCase(), t);
  for (const a of t.aliases || []) mapBySymbol.set(a.toLowerCase(), t);
}

export async function loadPiperxRegistry(force = false) {
  if (!force && Date.now() - loadedAt < TTL_MS && mapByAddr.size > 0) return;

  // reset + muat ENV dulu sebagai fallback
  mapByAddr = new Map();
  mapBySymbol = new Map();
  for (const t of ENV_TOKENS) indexToken(t);

  try {
    // ✅ path benar ke API route Next.js kita
    const r = await fetch("/api/piperx_tokens", { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      const arr: TokenEntry[] = Array.isArray(j.tokens) ? j.tokens : [];
      for (const t of arr) {
        const entry: TokenEntry = {
          symbol: String(t.symbol || "").toUpperCase(),
          address: String(t.address || "").toLowerCase() as `0x${string}`,
          decimals: t.decimals ?? null,
          aliases: (t.aliases || []).map((x: string) => String(x).toLowerCase()),
        };
        if (isAddr(entry.address) && entry.symbol) indexToken(entry);
      }
    }
  } catch {
    // diam: tetap pakai ENV kalau API error
  }

  loadedAt = Date.now();
}

export async function readyTokens() {
  await loadPiperxRegistry(false);
}

/** Resolve input (simbol/alias/alamat) -> address (0x...) */
export async function findTokenAddress(input: string): Promise<`0x${string}` | null> {
  await readyTokens();
  const s = (input || "").trim();
  if (!s) return null;
  if (isAddr(s)) return s as `0x${string}`;
  const hit = mapBySymbol.get(s.toLowerCase());
  return hit ? hit.address : null;
}

/** Balik: addr -> SYMBOL (uppercase), fallback: alamat apa adanya */
export async function symbolFor(address: string): Promise<string> {
  await readyTokens();
  const t = mapByAddr.get(address.toLowerCase());
  return t?.symbol || address;
}
