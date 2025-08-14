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
  const pc = usePublicClient({ chainId: AENEID_ID }); // ✅ paksa Aeneid

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isFullScan, setIsFullScan] = useState(false);

  const canQuery = useMemo(
    () => Boolean(isConnected && pc && SPG && address),
    [isConnected, pc, address]
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
    <div className="space-y-6">
      {/* BAR LUAR PANEL: kiri = back & scan, kanan = switch network */}
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
        <section className="rounded-2xl border border-white/10 bg-white/5 flex flex-col">
      {/* HEADER PANEL */}
      <div className="relative">
  {/* kontainer scroll */}
  <div className="max-h-[calc(100vh-240px)] overflow-y-auto pr-1 scrollbar-invisible">
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <div className="card">
        <h2 className="text-lg font-semibold">My Registered IP</h2>
        <p className="text-sm opacity-70">
          Collection:{" "}
          <code className="opacity-90">
            {SPG || "(set NEXT_PUBLIC_SPG_COLLECTION)"}
          </code>
        </p>
      </div>

      {!isConnected && (
        <div className="card">Connect wallet to see registered IP.</div>
      )}
      {!SPG && (
        <div className="card">
          Set <code>NEXT_PUBLIC_SPG_COLLECTION</code> di <code>.env.local</code>.
        </div>
      )}
      {isConnected && SPG && chainId !== AENEID_ID && (
        <div className="card">
          You are not currently in the Aeneid. Click{" "}
          <button onClick={ensureAeneid} className="underline hover:opacity-80">
            Switch to Aeneid
          </button>{" "}
          then refresh.
        </div>
      )}

      {loading && <div className="card">Loading...</div>}
      {error && <div className="card text-red-400">{error}</div>}
      {!loading && isConnected && SPG && items.length === 0 && (
        <div className="card">
          There are no registered IPs yet.
          <div className="mt-2 text-xs opacity-70">
            Tip: set <code>NEXT_PUBLIC_SPG_START_BLOCK</code> to speed up the full scan.
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => {
          const name = it.nftMeta?.name || `Token #${it.tokenId}`;
          const image = ipfsToHttps(it.nftMeta?.image);
          const desc = it.nftMeta?.description;
          const ipTitle = it.ipMeta?.title;
          const ipPrompt =
            it.ipMeta?.aiMetadata?.prompt || it.ipMeta?.description;

          return (
            <div key={it.tokenId} className="card space-y-3">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={image}
                  alt={name}
                  className="w-full h-40 object-cover rounded-xl"
                />
              ) : (
                <div className="w-full h-40 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-sm">
                  No image
                </div>
              )}

              <div className="space-y-1">
                <div className="font-medium">{name}</div>
                <div className="text-xs opacity-70">Token ID: {it.tokenId}</div>
                {desc && <p className="text-sm opacity-80">{desc}</p>}
              </div>

              {it.ipMeta && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  {ipTitle && (
                    <div className="text-sm">
                      <span className="opacity-70">Title:</span> {ipTitle}
                    </div>
                  )}
                  {ipPrompt && (
                    <div className="text-sm mt-1">
                      <span className="opacity-70">Prompt:</span>{" "}
                      <span className="whitespace-pre-wrap break-words">
                        {ipPrompt}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2">
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
          );
        })}
        </div>
  </div>
</div>
      </div>
      </section>
    </div>
  );
}
