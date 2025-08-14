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

// ---------- helpers env + static fallback (punya kamu sebelumnya) ----------
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

// ---------- dynamic registry dari PiperX (+ cache) ----------
type Registry = {
  bySymbol: Map<string, PiperxToken>;
  byAddress: Map<string, PiperxToken>;
  fetchedAt: number;
};

let REG: Registry | null = null;

const norm = (s: string) => s.trim().toUpperCase();

export async function loadPiperxRegistry(force = false): Promise<Registry> {
  const now = Date.now();
  if (!force && REG && now - REG.fetchedAt < CACHE_MS) return REG;

  // API route lokal kamu: /api/piperx_tokens
  const res = await fetch("/api/piperx_tokens", { cache: "no-store" });
  const list = res.ok ? ((await res.json()) as PiperxToken[]) : [];

  const bySymbol = new Map<string, PiperxToken>();
  const byAddress = new Map<string, PiperxToken>();

  for (const t of list) {
    if (!t?.address) continue;
    if (t.chainId && t.chainId !== AENEID_ID) continue;

    byAddress.set(t.address.toLowerCase(), t);

    if (t.symbol) {
      bySymbol.set(norm(t.symbol), t);

      // alias umum
      const up = t.symbol.toUpperCase();
      if (up === "WIP") {
        bySymbol.set("IP", t);
        bySymbol.set("WRAP IP", t);
        bySymbol.set("WRAPPED IP", t);
      }
      if (up === "USDC") {
        bySymbol.set("USD C", t);
        bySymbol.set("STABLE", t);
        bySymbol.set("DOLLAR", t);
      }
      if (up === "WETH") {
        bySymbol.set("ETH", t);
        bySymbol.set("WRAPPED ETH", t);
      }
    }
  }

  REG = { bySymbol, byAddress, fetchedAt: Date.now() };
  return REG;
}

// ---------- resolver utama yang dipakai PromptAgent ----------
export async function resolveToken(input: string): Promise<PiperxToken | null> {
  const s = input.trim();
  const reg = await loadPiperxRegistry();

  // alamat langsung
  if (isAddr(s)) {
    return (
      reg.byAddress.get(s.toLowerCase()) ?? {
        chainId: AENEID_ID,
        address: s as `0x${string}`,
        symbol: s,
      }
    );
  }

  // symbol/alias dari PiperX
  const t = reg.bySymbol.get(norm(s));
  if (t) return t;

  // fallback ke daftar statis ENV
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

export async function symbolFor(address: string): Promise<string> {
  const reg = await loadPiperxRegistry();
  const t = reg.byAddress.get(address.toLowerCase());
  if (t?.symbol) return t.symbol;

  const stat = TOKENS.find(
    (x) => x.address.toLowerCase() === address.toLowerCase()
  );
  if (stat?.symbol) return stat.symbol;

  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// ---------- kompabilitas dengan kode lama ----------
export async function findTokenAddress(input: string): Promise<`0x${string}` | null> {
  if (isAddr(input)) return input as `0x${string}`;

  const t = await resolveToken(input);
  return t?.address ?? null;
}
