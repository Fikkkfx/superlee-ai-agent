// src/lib/agent/tokens.ts
export type TokenEntry = {
  symbol: string;
  address: `0x${string}`;
  aliases?: string[]; // lowercase
};

const TTL_MS = 5 * 60 * 1000;

let REGISTRY: TokenEntry[] = [];
let lastLoaded = 0;

/* ---------- helpers ---------- */
const isAddr = (s?: string): s is `0x${string}` =>
  !!s && /^0x[0-9a-fA-F]{40}$/.test(s);

const envAddr = (k: string): `0x${string}` | null => {
  const v = (process.env as any)[k] as string | undefined;
  return isAddr(v) ? (v as `0x${string}`) : null;
};

const norm = (t: TokenEntry): TokenEntry => ({
  symbol: t.symbol.trim(),
  address: t.address,
  aliases: Array.from(new Set((t.aliases ?? []).map((a) => a.trim().toLowerCase()))),
});

function dedupeMerge(list: TokenEntry[]): TokenEntry[] {
  const byAddr = new Map<string, TokenEntry>();
  for (const raw of list) {
    const t = norm(raw);
    const k = t.address.toLowerCase();
    const ex = byAddr.get(k);
    if (!ex) {
      byAddr.set(k, t);
    } else {
      byAddr.set(k, {
        symbol: ex.symbol || t.symbol,
        address: ex.address,
        aliases: Array.from(new Set([...(ex.aliases ?? []), ...(t.aliases ?? [])])),
      });
    }
  }
  return Array.from(byAddr.values());
}

/* ---------- sources: ENV + PiperX API ---------- */
function envTokens(): TokenEntry[] {
  const out: TokenEntry[] = [];

  const pushIf = (sym: string, key: string, aliases: string[]) => {
    const addr = envAddr(key);
    if (addr) out.push({ symbol: sym, address: addr, aliases });
  };

  pushIf("WIP", "NEXT_PUBLIC_PIPERX_WIP", [
    "wip",
    "ip",
    "native",
    "wrap ip",
    "wrapped ip",
  ]);
  pushIf("USDC", "NEXT_PUBLIC_TOKEN_USDC", ["usdc", "usd c", "stable", "dollar"]);
  pushIf("WETH", "NEXT_PUBLIC_TOKEN_WETH", ["weth", "eth", "wrapped eth"]);

  return out;
}

/**
 * Memuat token registry dari PiperX (route: /api/piperx/tokens) + ENV dan cache 5 menit.
 * Panggil ini sebelum menggunakan findTokenAddress/symbolFor.
 */
export async function readyTokens(): Promise<void> {
  const now = Date.now();
  if (REGISTRY.length && now - lastLoaded < TTL_MS) return;

  const base = envTokens();

  let fromApi: TokenEntry[] = [];
  try {
    const r = await fetch("/api/piperx/tokens", { cache: "no-store" });
    if (r.ok) {
      const js = await r.json();
      // harapkan format: { tokens: Array<{symbol,address,aliases?}> }
      const arr: any[] = Array.isArray(js?.tokens) ? js.tokens : [];
      fromApi = arr
        .filter((x) => isAddr(x?.address) && typeof x?.symbol === "string")
        .map((x) => ({
          symbol: String(x.symbol),
          address: x.address as `0x${string}`,
          aliases:
            Array.isArray(x.aliases) && x.aliases.length
              ? x.aliases.map((a: any) => String(a).toLowerCase())
              : [],
        }));
    }
  } catch {
    // biarkan hanya ENV bila API gagal
  }

  REGISTRY = dedupeMerge([...base, ...fromApi]);
  lastLoaded = now;
}

/* ---------- resolvers ---------- */
export async function findTokenAddress(input: string): Promise<`0x${string}` | null> {
  await readyTokens();

  const s = input.trim();
  if (isAddr(s)) return s as `0x${string}`;

  const q = s.toLowerCase();
  for (const t of REGISTRY) {
    if (t.symbol.toLowerCase() === q) return t.address;
    if (t.aliases?.some((a) => a === q)) return t.address;
  }
  return null;
}

export async function symbolFor(address: string): Promise<string> {
  await readyTokens();
  const a = address.toLowerCase();
  const t = REGISTRY.find((x) => x.address.toLowerCase() === a);
  return t?.symbol || address;
}

/* Optional: expose daftar untuk debug/UX */
export function listTokens(): TokenEntry[] {
  return REGISTRY.slice();
}
