"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useChainId,
  useSwitchChain,
} from "wagmi";
import { erc721Abi, parseAbiItem } from "viem";

type Item = {
  tokenId: string;
  tokenURI?: string;
  nftMeta?: any | null;
  ipMeta?: any | null;
};

const AENEID_ID = 1315;
const SPG = process.env.NEXT_PUBLIC_SPG_COLLECTION as `0x${string}` | undefined;
const START_BLOCK = BigInt(process.env.NEXT_PUBLIC_SPG_START_BLOCK ?? "0");

// IERC165: ERC721Enumerable = 0x780e9d63
const IFACE_ENUMERABLE = "0x780e9d63";

function ipfsToHttps(url?: string) {
  if (!url) return "";
  if (url.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${url.slice(7)}`;
  const m = url.match(/\/ipfs\/([^/?#]+)/i);
  if (m?.[1]) return `https://ipfs.io/ipfs/${m[1]}`;
  if (/^(baf|Qm)[a-zA-Z0-9]+$/.test(url)) return `https://ipfs.io/ipfs/${url}`;
  return url;
}

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const pc = usePublicClient({ chainId: AENEID_ID }); // paksa Aeneid

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isFullScan, setIsFullScan] = useState(false);

  const canQuery = useMemo(
    () => Boolean(isConnected && pc && SPG && address),
    [isConnected, pc, address, SPG]
  );

  // ---------- Fast path: ERC721Enumerable ----------
  async function tryEnumerableRoute(): Promise<string[] | null> {
    if (!pc || !SPG || !address) return null;
    try {
      const supports = (await pc.readContract({
        address: SPG,
        abi: [
          {
            type: "function",
            name: "supportsInterface",
            stateMutability: "view",
            inputs: [{ name: "interfaceId", type: "bytes4" }],
            outputs: [{ type: "bool" }],
          },
        ] as const,
        functionName: "supportsInterface",
        args: [IFACE_ENUMERABLE as unknown as `0x${string}`],
      })) as boolean;

      if (!supports) return null;

      const bal = (await pc.readContract({
        address: SPG,
        abi: erc721Abi,
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      })) as bigint;

      if (bal === 0n) return [];

      const tokenIds: string[] = [];
      for (let i = 0n; i < bal; i++) {
        const tid = (await pc.readContract({
          address: SPG,
          abi: [
            {
              type: "function",
              name: "tokenOfOwnerByIndex",
              stateMutability: "view",
              inputs: [
                { name: "owner", type: "address" },
                { name: "index", type: "uint256" },
              ],
              outputs: [{ type: "uint256" }],
            },
          ] as const,
          functionName: "tokenOfOwnerByIndex",
          args: [address as `0x${string}`, i],
        })) as bigint;
        tokenIds.push(tid.toString());
      }
      tokenIds.sort((a, b) => Number(b) - Number(a));
      return tokenIds;
    } catch {
      return null;
    }
  }

  // ---------- Fallback: progressive log scan ----------
  async function fetchLogsProgressive(): Promise<string[]> {
    if (!pc || !SPG || !address) return [];
    const latest = await pc.getBlockNumber();

    let range = 60_000n; // kecil → cepat tampil
    const maxBack = 2_000_000n;
    const minFrom = latest > maxBack ? latest - maxBack : 0n;

    const tokenIds = new Set<string>();
    while (true) {
      const from = latest > range ? latest - range : 0n;
      const logs = await pc.getLogs({
        address: SPG,
        event: parseAbiItem(
          "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
        ),
        args: { to: address as `0x${string}` },
        fromBlock: from,
        toBlock: latest,
      });
      for (const l of logs) {
        const tid = (l.args?.tokenId as bigint)?.toString?.();
        if (tid) tokenIds.add(tid);
      }
      if (tokenIds.size > 0 || from <= minFrom) break;
      range = range * 2n;
      if (range > maxBack) range = maxBack;
    }

    return Array.from(tokenIds).sort((a, b) => Number(b) - Number(a));
  }

  // ---------- Optional: full history scan ----------
  async function fetchLogsFull(): Promise<string[]> {
    if (!pc || !SPG || !address) return [];
    const latest = await pc.getBlockNumber();
    const step = 75_000n;
    const tokenIds = new Set<string>();

    for (let from = START_BLOCK; from <= latest; from += step) {
      const to = from + step - 1n > latest ? latest : from + step - 1n;
      const logs = await pc.getLogs({
        address: SPG,
        event: parseAbiItem(
          "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
        ),
        args: { to: address as `0x${string}` },
        fromBlock: from,
        toBlock: to,
      });
      for (const l of logs) {
        const tid = (l.args?.tokenId as bigint)?.toString?.();
        if (tid) tokenIds.add(tid);
      }
    }
    return Array.from(tokenIds).sort((a, b) => Number(b) - Number(a));
  }

  async function buildItems(tokenIds: string[]) {
    if (!pc || !SPG) return [];
    const results: Item[] = await Promise.all(
      tokenIds.map(async (id) => {
        let tokenURI: string | undefined;
        try {
          tokenURI = (await pc.readContract({
            address: SPG,
            abi: erc721Abi,
            functionName: "tokenURI",
            args: [BigInt(id)],
          })) as string;
        } catch {}

        let nftMeta: any = null;
        if (tokenURI) {
          try {
            nftMeta = await fetch(ipfsToHttps(tokenURI)).then((r) => r.json());
          } catch {}
        }

        const ipMetaUri: string | undefined =
          nftMeta?.ipMetadataURI ||
          nftMeta?.attributes?.find?.(
            (a: any) =>
              a?.trait_type?.toLowerCase?.() === "ip_metadata_uri" ||
              a?.trait_type?.toLowerCase?.() === "ipmetadatauri"
          )?.value;

        let ipMeta: any = null;
        if (ipMetaUri) {
          try {
            ipMeta = await fetch(ipfsToHttps(String(ipMetaUri))).then((r) =>
              r.json()
            );
          } catch {}
        }

        return { tokenId: id, tokenURI, nftMeta, ipMeta };
      })
    );
    return results;
  }

  async function loadData(full = false) {
    if (!canQuery) return;
    setLoading(true);
    setError(null);
    try {
      let tokenIds = await tryEnumerableRoute();
      if (tokenIds === null) {
        tokenIds = full ? await fetchLogsFull() : await fetchLogsProgressive();
      }
      const list = await buildItems(tokenIds || []);
      setItems(list);
    } catch (e: any) {
      setError(e?.message || "Failed to load IP list");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (canQuery) loadData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canQuery]);

  async function ensureAeneid() {
    if (chainId !== AENEID_ID) {
      try {
        await switchChainAsync({ chainId: AENEID_ID });
      } catch (e: any) {
        setError(e?.message || "Switch network rejected");
      }
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 space-y-6">
      {/* TOP BAR */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="rounded-full bg-white/10 border border-white/15 px-3 py-1 text-sm hover:bg-white/15"
          >
            ← back
          </Link>

          <button
            onClick={() => {
              setIsFullScan(true);
              loadData(true);
            }}
            className="rounded-full bg-white/10 border border-white/15 px-3 py-1 text-sm hover:bg-white/15"
            title="Scan full history (slower)"
          >
            {isFullScan ? "Rescan Full" : "Scan full history"}
          </button>
        </div>

        {chainId !== AENEID_ID && (
          <button
            onClick={ensureAeneid}
            disabled={switching}
            className="rounded-full bg-sky-500/90 hover:bg-sky-400 text-white px-3 py-1 text-sm disabled:opacity-60"
          >
            {switching ? "Switching…" : "Switch to Aeneid"}
          </button>
        )}
      </div>

      {/* HEADER PANEL (selalu di atas) */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 md:p-6">
        <h2 className="text-xl md:text-2xl font-semibold mb-2">
          My Registered IP
        </h2>
        <div className="text-sm opacity-80">
          Collection:
          <span className="ml-2 font-mono text-[13px] px-2 py-0.5 rounded-md bg-white/5 border border-white/10">
            {SPG || "(set NEXT_PUBLIC_SPG_COLLECTION)"}
          </span>
        </div>
      </section>

      {/* GRID KARTU (di bawah header) */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="max-h-[calc(100vh-260px)] overflow-y-auto pr-1 scrollbar-invisible">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {/* Status cards */}
            {!isConnected && (
              <div className="col-span-full rounded-xl border border-white/10 bg-white/5 p-4">
                Connect wallet to see registered IP.
              </div>
            )}
            {!SPG && (
              <div className="col-span-full rounded-xl border border-white/10 bg-white/5 p-4">
                Set <code>NEXT_PUBLIC_SPG_COLLECTION</code> di{" "}
                <code>.env.local</code>.
              </div>
            )}
            {isConnected && SPG && chainId !== AENEID_ID && (
              <div className="col-span-full rounded-xl border border-white/10 bg-white/5 p-4">
                You are not in Aeneid.{" "}
                <button
                  onClick={ensureAeneid}
                  className="underline hover:opacity-80"
                >
                  Switch to Aeneid
                </button>{" "}
                lalu refresh.
              </div>
            )}
            {loading && (
              <div className="col-span-full rounded-xl border border-white/10 bg-white/5 p-4">
                Loading…
              </div>
            )}
            {error && (
              <div className="col-span-full rounded-xl border border-white/10 bg-white/5 p-4 text-red-400">
                {error}
              </div>
            )}
            {!loading && isConnected && SPG && items.length === 0 && (
              <div className="col-span-full rounded-xl border border-white/10 bg-white/5 p-4">
                There are no registered IPs yet.
                <div className="mt-2 text-xs opacity-70">
                  Tip: set <code>NEXT_PUBLIC_SPG_START_BLOCK</code> untuk
                  mempercepat full scan.
                </div>
              </div>
            )}

            {/* IP Cards */}
            {items.map((it) => {
              const name = it.nftMeta?.name || `Token #${it.tokenId}`;
              const image = ipfsToHttps(it.nftMeta?.image);
              const desc = it.nftMeta?.description;
              const ipTitle = it.ipMeta?.title;
              const ipPrompt =
                it.ipMeta?.aiMetadata?.prompt || it.ipMeta?.description;

              return (
                <article
                  key={it.tokenId}
                  className="
                    group rounded-2xl overflow-hidden
                    border border-white/10 bg-white/5 backdrop-blur-sm
                    ring-1 ring-white/5
                    transition will-change-transform
                    hover:-translate-y-0.5 hover:shadow-[0_10px_40px_rgba(34,211,238,.18)]
                    hover:border-sky-400/30 hover:ring-sky-400/30
                  "
                >
                  {/* gambar */}
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {image ? (
                      <img
                        src={image}
                        alt={name}
                        className="w-full aspect-[4/3] object-cover"
                      />
                    ) : (
                      <div className="w-full aspect-[4/3] bg-white/5 border-b border-white/10 flex items-center justify-center text-sm">
                        No image
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent opacity-80" />
                    <div className="absolute left-4 bottom-3 text-[11px] tracking-wide uppercase opacity-90">
                      IP Ownership
                    </div>
                  </div>

                  {/* body */}
                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base font-semibold leading-5">
                        {name}
                      </h3>
                      <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
                        #{it.tokenId}
                      </span>
                    </div>

                    {desc && (
                      <p className="text-xs opacity-70 line-clamp-2">{desc}</p>
                    )}

                    {it.ipMeta && (
                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        {ipTitle && (
                          <div className="text-sm">
                            <span className="opacity-60">Title:</span>{" "}
                            {ipTitle}
                          </div>
                        )}
                        {ipPrompt && (
                          <div className="text-sm mt-1">
                            <span className="opacity-60">Prompt:</span>{" "}
                            <span className="whitespace-pre-wrap break-words">
                              {ipPrompt}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-3 pt-1">
                      {it.tokenURI && (
                        <a
                          className="text-xs underline opacity-80 hover:opacity-100"
                          href={ipfsToHttps(it.tokenURI)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          NFT metadata
                        </a>
                      )}
                      {it.ipMeta?.image && (
                        <a
                          className="text-xs underline opacity-80 hover:opacity-100"
                          href={ipfsToHttps(it.ipMeta.image)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          IP image
                        </a>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
