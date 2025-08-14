// src/lib/agent/tokens.ts

export type TokenEntry = {
  symbol: string;
  address: `0x${string}`;
  aliases?: string[]; // lowercase
};

export type PiperxToken = {
  chainId: number;
  address: `0x${string}`;
  symbol: string;
  name?: string;
  decimals?: number;
};

const AENEID_ID = 1315;
const CACHE_MS = 5 * 60 * 1000; // 5 menit

// ---------- helpers env + static fallback ----------
const env = (k: string) => process.env[k] as `0x${string}` | undefined;
const isAddr = (s: string): s is `0x${string}` => /^0x[a-fA-F0-9]{40}$/.test(s);

const TOKENS_RAW: (TokenEntry | undefined)[] = [
  env("NEXT_PUBLIC_PIPERX_WIP") && {
    symbol: "WIP",
    address: env("NEXT_PUBLIC_PIPERX_WIP")!,
    aliases: ["ip", "native", "wrap ip", "wrapped ip", "wip"],
  },
  env("NEXT_PUBLIC_TOKEN_USDC") && {
    symbol: "USDC",
    address: env("NEXT_PUBLIC_TOKEN_USDC")!,
    aliases: ["usdc", "usd c", "stable", "dollar"],
  },
  env("NEXT_PUBLIC_TOKEN_WETH") && {
    symbol: "WETH",
    address: env("NEXT_PUBLIC_TOKEN_WETH")!,
    aliases: ["eth", "weth", "wrapped eth"],
  },
];

export const TOKENS: TokenEntry[] = TOKENS_RAW.filter(Boolean) as TokenEntry[];

type Registry = {
  bySymbol: Map<string, PiperxToken>;
  byAddress: Map<string, PiperxToken>;
  fetchedAt: number;
};

let REG: Registry | null = null;

const up = (s: string) => s.trim().toUpperCase();

// ---------- load registry dari PiperX (async) ----------
export async function loadPiperxRegistry(force = false): Promise<Registry> {
  const now = Date.now();
  if (!force && REG && now - REG.fetchedAt < CACHE_MS) return REG;

  // API lokal kamu → /api/piperx_tokens
  const res = await fetch("/api/piperx_tokens", { cache: "no-store" });
  const list = res.ok ? ((await res.json()) as PiperxToken[]) : [];

  const bySymbol = new Map<string, PiperxToken>();
  const byAddress = new Map<string, PiperxToken>();

  for (const t of list) {
    if (!t?.address) continue;
    if (t.chainId && t.chainId !== AENEID_ID) continue;

    byAddress.set(t.address.toLowerCase(), t);

    if (t.symbol) {
      const symU = up(t.symbol);
      bySymbol.set(symU, t);
      // alias umum
      if (symU === "WIP") {
        bySymbol.set("IP", t);
        bySymbol.set("WRAP IP", t);
        bySymbol.set("WRAPPED IP", t);
      }
      if (symU === "USDC") {
        bySymbol.set("USD C", t);
        bySymbol.set("STABLE", t);
        bySymbol.set("DOLLAR", t);
      }
      if (symU === "WETH") {
        bySymbol.set("ETH", t);
        bySymbol.set("WRAPPED ETH", t);
      }
    }
  }

  REG = { bySymbol, byAddress, fetchedAt: Date.now() };
  return REG;
}

// ---------- util sinkron (pakai cache REG kalau ada, fallback ENV) ----------
function resolveFromCacheOrEnv(input: string): PiperxToken | null {
  const s = input.trim();

  // address langsung
  if (isAddr(s)) {
    // coba lookup di cache:
    const t = REG?.byAddress.get(s.toLowerCase());
    if (t) return t;
    // fallback minimal
    return { chainId: AENEID_ID, address: s as `0x${string}`, symbol: s };
  }

  // via registry (kalau sudah loaded)
  const fromReg = REG?.bySymbol.get(up(s));
  if (fromReg) return fromReg;

  // fallback ENV statis
  const stat =
    TOKENS.find(
      (x) =>
        x.symbol.toLowerCase() === s.toLowerCase() ||
        x.aliases?.some((a) => a === s.toLowerCase())
    ) || null;
  return stat
    ? { chainId: AENEID_ID, address: stat.address, symbol: stat.symbol }
    : null;
}

// ---------- API SINKRON (kompatibel dgn engine.ts) ----------
/** Cari address berdasarkan symbol/alias/CA, tanpa await. Menggunakan cache PiperX bila ada, jika tidak fallback ke ENV. */
export function findTokenAddress(input: string): `0x${string}` | null {
  if (isAddr(input)) return input as `0x${string}`;
  const t = resolveFromCacheOrEnv(input);
  return t?.address ?? null;
}

/** Dapatkan simbol untuk address, sinkron. */
export function symbolFor(address: string): string {
  const t = REG?.byAddress.get(address.toLowerCase());
  if (t?.symbol) return t.symbol;
  const stat = TOKENS.find(
    (x) => x.address.toLowerCase() === address.toLowerCase()
  );
  if (stat?.symbol) return stat.symbol;
  // fallback pemendek
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// ---------- API ASINKRON (untuk fitur yang butuh registry terbaru) ----------
export async function resolveTokenAsync(
  input: string
): Promise<PiperxToken | null> {
  await loadPiperxRegistry(); // pastikan cache ada/baru
  const s = input.trim();
  if (isAddr(s)) {
    const t = REG!.byAddress.get(s.toLowerCase());
    return t ?? { chainId: AENEID_ID, address: s as `0x${string}`, symbol: s };
  }
  const t = REG!.bySymbol.get(up(s));
  if (t) return t;

  // fallback ENV
  const stat =
    TOKENS.find(
      (x) =>
        x.symbol.toLowerCase() === s.toLowerCase() ||
        x.aliases?.some((a) => a === s.toLowerCase())
    ) || null;
  return stat
    ? { chainId: AENEID_ID, address: stat.address, symbol: stat.symbol }
    : null;
}

export async function findTokenAddressAsync(
  input: string
): Promise<`0x${string}` | null> {
  const t = await resolveTokenAsync(input);
  return t?.address ?? null;
}

export async function symbolForAsync(address: string): Promise<string> {
  await loadPiperxRegistry();
  const t = REG!.byAddress.get(address.toLowerCase());
  if (t?.symbol) return t.symbol;
  const stat = TOKENS.find(
    (x) => x.address.toLowerCase() === address.toLowerCase()
  );
  if (stat?.symbol) return stat.symbol;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
