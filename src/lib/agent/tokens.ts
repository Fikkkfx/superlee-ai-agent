// src/lib/agent/tokens.ts
export type TokenEntry = {
  symbol: string;
  address: `0x${string}`;
  aliases?: string[];
};

type RegistryToken = { symbol?: string; ticker?: string; address?: string; tokenAddress?: string };

const FIVE_MIN = 5 * 60 * 1000;

const isHex = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s);
const envAddr = (k: string) => (process.env[k]?.trim() || "") as `0x${string}` | "";

const ENV_TOKENS: TokenEntry[] = (() => {
  const out: TokenEntry[] = [];
  const wip = envAddr("NEXT_PUBLIC_PIPERX_WIP");
  if (wip)
    out.push({
      symbol: "WIP",
      address: wip,
      aliases: ["ip", "wip", "wrap ip", "wrapped ip", "native"],
    });

  const usdc = envAddr("NEXT_PUBLIC_TOKEN_USDC");
  if (usdc)
    out.push({
      symbol: "USDC",
      address: usdc,
      aliases: ["usdc", "usd c", "stable", "dollar"],
    });

  const weth = envAddr("NEXT_PUBLIC_TOKEN_WETH");
  if (weth)
    out.push({
      symbol: "WETH",
      address: weth,
      aliases: ["eth", "weth", "wrapped eth"],
    });

  return out;
})();

let CACHE:
  | {
      at: number;
      bySymbol: Map<string, TokenEntry>;
      byAddr: Map<string, TokenEntry>;
    }
  | null = null;

function buildIndex(list: TokenEntry[]) {
  const bySymbol = new Map<string, TokenEntry>();
  const byAddr = new Map<string, TokenEntry>();
  for (const t of list) {
    const base = { ...t, symbol: t.symbol.toUpperCase() };
    byAddr.set(base.address.toLowerCase(), base);
    const keys = [base.symbol.toLowerCase(), ...(base.aliases?.map((a) => a.toLowerCase()) || [])];
    for (const k of keys) if (!bySymbol.has(k)) bySymbol.set(k, base);
  }

  // Tambah alias IP otomatis ke WIP bila ada
  const wip = [...byAddr.values()].find((x) => x.symbol === "WIP");
  if (wip) {
    for (const k of ["ip", "wip", "wrap ip", "wrapped ip", "native"])
      if (!bySymbol.has(k)) bySymbol.set(k, wip);
  }

  return { bySymbol, byAddr };
}

async function fetchRegistry(): Promise<TokenEntry[]> {
  // Coba dua path agar tidak tergantung penamaan folder
  const tryUrls = ["/api/piperx_tokens", "/api/piperx/tokens"];
  for (const u of tryUrls) {
    try {
      const r = await fetch(u);
      if (!r.ok) continue;
      const data = await r.json();
      const arr: RegistryToken[] = Array.isArray(data) ? data : data?.tokens || [];
      const out: TokenEntry[] = [];
      for (const it of arr) {
        const symbol = String(it.symbol ?? it.ticker ?? "").toUpperCase().trim();
        const addr = String(it.address ?? it.tokenAddress ?? "").toLowerCase();
        if (symbol && isHex(addr)) out.push({ symbol, address: addr as `0x${string}` });
      }
      return out;
    } catch {
      /* try next url */
    }
  }
  return [];
}

export async function readyTokens(force = false) {
  if (!force && CACHE && Date.now() - CACHE.at < FIVE_MIN) return;

  const fromRegistry = await fetchRegistry().catch(() => [] as TokenEntry[]);
  // Merge: registry + ENV (ENV override/menambah alias)
  const merged: TokenEntry[] = [];
  const merge = (src: TokenEntry[]) => {
    for (const t of src) {
      const i = merged.findIndex(
        (x) =>
          x.address.toLowerCase() === t.address.toLowerCase() ||
          x.symbol.toLowerCase() === t.symbol.toLowerCase()
      );
      if (i >= 0) {
        merged[i] = {
          symbol: t.symbol || merged[i].symbol,
          address: (t.address || merged[i].address) as `0x${string}`,
          aliases: [...new Set([...(merged[i].aliases || []), ...(t.aliases || [])])],
        };
      } else {
        merged.push({ ...t, aliases: [...(t.aliases || [])] });
      }
    }
  };
  merge(fromRegistry);
  merge(ENV_TOKENS);

  const idx = buildIndex(merged);
  CACHE = { at: Date.now(), ...idx };

  // (opsional) debug di console
  (globalThis as any).__TOKENS__ = {
    count: merged.length,
    sample: merged.slice(0, 6),
  };
}

/** Resolve simbol/alias/alamat → address */
export async function findTokenAddress(input: string): Promise<`0x${string}` | null> {
  await readyTokens();
  const raw = input.trim();
  if (isHex(raw)) return raw as `0x${string}`;
  const key = raw.toLowerCase();
  const t = CACHE?.bySymbol.get(key);
  return t ? (t.address as `0x${string}`) : null;
}

/** Dapatkan simbol untuk sebuah address (untuk tampilan Plan/log) */
export async function symbolFor(address: string): Promise<string> {
  await readyTokens();
  const t = CACHE?.byAddr.get(address.toLowerCase());
  return t?.symbol || address;
}
