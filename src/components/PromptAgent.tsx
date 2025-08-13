"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  useAccount,
  useChainId,
  useSwitchChain,
  usePublicClient,
} from "wagmi";
import { decide } from "@/lib/agent/engine";
import {
  getDecimals,
  getQuote,
  approveForAggregator,
  swapViaAggregator,
} from "@/lib/piperx";
import { useStoryClient } from "@/lib/storyClient";
import { storyAeneid } from "@/lib/chains/story";
import { Paperclip, Check, X, Send } from "lucide-react";
import {
  parseUnits,
  toHex,
  keccak256,
  type Hex,
  createPublicClient,
  http,
} from "viem";

/* ---------- utils (hash, ipfs, fetch) ---------- */
function bytesKeccak(data: Uint8Array): `0x${string}` {
  return keccak256(toHex(data)) as `0x${string}`;
}
async function keccakOfJson(obj: any): Promise<`0x${string}`> {
  return bytesKeccak(new TextEncoder().encode(JSON.stringify(obj)));
}
async function sha256HexOfFile(file: File): Promise<`0x${string}`> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return toHex(new Uint8Array(hash), { size: 32 });
}
function extractCid(u?: string): string {
  if (!u) return "";
  if (u.startsWith("ipfs://")) return u.slice(7);
  const m = u.match(/\/ipfs\/([^/?#]+)/i);
  return m?.[1] || u;
}
function toHttps(cidOrUrl?: string) {
  const cid = extractCid(cidOrUrl);
  return cid ? `https://ipfs.io/ipfs/${cid}` : "";
}
function toIpfsUri(cidOrUrl?: string) {
  const cid = extractCid(cidOrUrl);
  return `ipfs://${cid}` as const;
}
async function fetchJSON(input: RequestInfo | URL, init?: RequestInit) {
  const r = await fetch(input, init);
  const t = await r.text();
  if (!r.ok)
    throw new Error(
      `HTTP ${r.status}${r.statusText ? " " + r.statusText : ""}: ${t.slice(0, 200)}`
    );
  try {
    return JSON.parse(t);
  } catch {
    throw new Error(`Server returned non-JSON: ${t.slice(0, 200)}`);
  }
}
async function compressImage(
  file: File,
  o: { maxDim?: number; quality?: number; targetMaxBytes?: number } = {}
) {
  const { maxDim = 1600, quality = 0.85, targetMaxBytes = 3.5 * 1024 * 1024 } = o;
  if (file.size <= targetMaxBytes) return file;
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const blob: Blob = await new Promise((res) =>
    c.toBlob((b) => res(b as Blob), "image/webp", quality)
  );
  return new File([blob], (file.name.replace(/\.\w+$/, "") || "image") + ".webp", {
    type: "image/webp",
  });
}

/** Minimal client untuk menunggu konfirmasi tx */
type TxClient = {
  waitForTransactionReceipt: (args: { hash: Hex; confirmations?: number }) => Promise<any>;
  getTransactionReceipt: (args: { hash: Hex }) => Promise<any>;
};

type Msg = { role: "you" | "agent"; text: string; ts: number };

/* ---------- helpers tambahan (SPG & error) ---------- */
const PLACEHOLDER_SPG =
  "0xc32A8a0FF3beDDDa58393d022aF433e78739FAbc".toLowerCase();

function isHexAddress(a: string): a is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(a);
}

/** Ambil SPG dari env: trim + valid hex. (Tidak memblok meski sama dengan placeholder.) */
function getEnvSpg(): `0x${string}` | null {
  const raw = (process.env.NEXT_PUBLIC_SPG_COLLECTION ?? "").trim();
  if (!raw) return null;
  if (!isHexAddress(raw)) return null;
  return raw as `0x${string}`;
}

function mask(addr: string) {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function prettyErr(e: any): string {
  const msgs: string[] = [];
  if (e?.shortMessage) msgs.push(e.shortMessage);
  if (e?.cause?.shortMessage) msgs.push(e.cause.shortMessage);
  if (e?.message) msgs.push(e.message);
  const joined = msgs.join(" | ");
  if (/Transaction failed|revert/i.test(joined))
    return `${joined} — kemungkinan alamat SPG collection tidak valid/izin mint tidak sesuai. Pastikan NEXT_PUBLIC_SPG_COLLECTION adalah koleksi SPG milikmu di Aeneid (1315).`;
  return joined || String(e);
}

export default function PromptAgent() {
  const { isConnected, address } = useAccount();
  const { getClient } = useStoryClient();

  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  // Wagmi public client (bisa null saat SSR) -> cast longgar ke TxClient
  const wagmiPc = usePublicClient({ chainId: 1315 });
  const storyPc = (wagmiPc as unknown as TxClient) ?? null;

  // Ambil RPC URL dengan fallback aman (public -> default)
  const rpcUrlsAny = storyAeneid.rpcUrls as any;
  const storyRpcUrl: string =
    (rpcUrlsAny.public?.http?.[0] as string | undefined) ??
    (rpcUrlsAny.default?.http?.[0] as string);

  // Fallback viem client murni untuk tunggu receipt
  const storyWaitRef = useRef<TxClient | null>(null);
  useEffect(() => {
    if (!storyWaitRef.current && storyRpcUrl) {
      storyWaitRef.current = createPublicClient({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        chain: storyAeneid as any,
        transport: http(storyRpcUrl),
      }) as unknown as TxClient;
    }
  }, [storyRpcUrl]);

  // Client on-demand (tanpa menunggu useEffect)
  function getTxClient(): TxClient {
    if (storyWaitRef.current) return storyWaitRef.current;
    storyWaitRef.current = createPublicClient({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chain: storyAeneid as any,
      transport: http(storyRpcUrl),
      pollingInterval: 1500,
    }) as unknown as TxClient;
    return storyWaitRef.current;
  }

  const [prompt, setPrompt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [plan, setPlan] = useState<string[] | null>(null);
  const [intent, setIntent] = useState<any>(null);
  const [status, setStatus] = useState<string>(""); // internal
  const [toast, setToast] = useState<string | null>(null);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const explorerBase =
    storyAeneid.blockExplorers?.default.url || "https://aeneid.storyscan.xyz";

  /* helpers */
  function push(role: Msg["role"], text: string) {
    setMessages((m) => [...m, { role, text, ts: Date.now() }]);
  }
  function showStatus(s: string) {
    setStatus(s);
    push("agent", `ℹ️ ${s}`);
  }
  function clearPlan() {
    setPlan(null);
    setIntent(null);
    setStatus("");
  }
  function onPickFile(f?: File) {
    if (!f) return;
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  }
  function removeFile() {
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }
  function handleAutoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  /** Switch ke Aeneid (1315). Return true jika sudah di Aeneid atau switch sukses. */
  async function ensureAeneid(): Promise<boolean> {
    if (chainId === 1315) return true;
    try {
      await switchChainAsync({ chainId: 1315 });
      return true;
    } catch {
      return false; // user cancel / gagal
    }
  }

  function newChat() {
    setMessages([]);
    setPlan(null);
    setIntent(null);
    setStatus("");
    setToast(null);
    setFile(null);
    setPreviewUrl(null);
    try {
      localStorage.removeItem("agentMessages");
    } catch {}
  }

  /* effects */
  useEffect(() => {
    if (taRef.current) handleAutoGrow(taRef.current);
  }, [prompt]);
  useEffect(() => {
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    try {
      const s = localStorage.getItem("agentMessages");
      if (s) setMessages(JSON.parse(s));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("agentMessages", JSON.stringify(messages));
    } catch {}
  }, [messages]);
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl]
  );

  /* actions */
  function onRun() {
    const p = prompt.trim();
    if (!p) return;

    push("you", p);
    setStatus("");

    // clear textarea segera
    setPrompt("");
    if (taRef.current) taRef.current.style.height = "40px";

    const d = decide(p);
    if (d.type === "ask") {
      setPlan(null);
      setIntent(null);
      push("agent", d.question);
      setStatus(d.question);
      return;
    }
    setPlan(d.plan);
    setIntent(d.intent);
    push(
      "agent",
      ["Plan:", ...d.plan.map((s: string, i: number) => `${i + 1}. ${s}`)].join(
        "\n"
      )
    );
  }

  async function awaitConfirmOnStory(hash: Hex): Promise<boolean> {
    const pc: TxClient = (storyPc as TxClient) ?? getTxClient();

    try {
      const r: any = await pc.waitForTransactionReceipt({
        hash,
        confirmations: 1,
      });
      const st = r?.status;
      if (st === "success" || st === 1 || st === "0x1" || st === true) return true;
      if (r?.blockNumber != null && st !== "reverted") return true;
    } catch {
      /* lanjut polling */
    }

    const deadline = Date.now() + 180_000; // 3 menit
    while (Date.now() < deadline) {
      try {
        const rcpt: any = await pc.getTransactionReceipt({ hash });
        const st = rcpt?.status;
        if (st === "success" || st === 1 || st === "0x1" || st === true) return true;
        if (rcpt?.blockNumber != null && st !== "reverted") return true;
      } catch {}
      await new Promise((r) => setTimeout(r, 1500));
    }
    return false;
  }

  async function onConfirm() {
    if (!intent) return;

    // sembunyikan plan saat confirm
    setPlan(null);

    if (intent.kind === "swap") {
      try {
        showStatus("Fetching quote…");
        const dec = await getDecimals(intent.tokenIn as `0x${string}`);
        const amountRaw = parseUnits(String(intent.amount), dec);
        const q = await getQuote({
          tokenIn: intent.tokenIn,
          tokenOut: intent.tokenOut,
          amountInRaw: amountRaw.toString(),
          slippagePct: intent.slippagePct,
        });

        showStatus("Approving token…");
        await approveForAggregator(intent.tokenIn as `0x${string}`, amountRaw);

        showStatus("Swapping via aggregator…");
        const tx = await swapViaAggregator(q.universalRoutes);

        push(
          "agent",
          `Swap success ✅
From: ${intent.tokenIn}
To: ${intent.tokenOut}
Amount: ${intent.amount}
Tx: ${tx.hash}
↗ View: ${explorerBase}/tx/${tx.hash}`
        );
        setToast("Swap success ✅");
        clearPlan();
      } catch (e: any) {
        push("agent", `Swap error: ${prettyErr(e)}`);
        setToast("Swap error ❌");
      }
      return;
    }

    if (intent.kind === "register") {
      try {
        if (!file) {
          showStatus("Butuh gambar. Klik ikon attach.");
          setToast("Attach image dulu 📎");
          return;
        }

        // Ambil SPG dari env (valid hex). Jika null -> belum set / salah format.
        const spgAddr = getEnvSpg();
        if (!spgAddr) {
          push(
            "agent",
            "❗ NEXT_PUBLIC_SPG_COLLECTION belum valid. Pastikan formatnya adalah alamat hex 42 karakter (0x + 40 hex) di .env.local, lalu restart dev server."
          );
          return;
        }

        // Info ke user alamat yang dipakai (masking)
        push("agent", `Using SPG collection: ${mask(spgAddr)}`);
        if (spgAddr.toLowerCase() === PLACEHOLDER_SPG) {
          push("agent", "⚠️ Alamat ini tampak seperti placeholder. Tetap melanjutkan sesuai permintaan…");
        }

        // Pastikan chain
        if (!(await ensureAeneid())) {
          push("agent", "❗ Gagal switch ke Aeneid (1315). Transaksi dibatalkan.");
          return;
        }

        showStatus("Optimizing image…");
        const fileToUpload = await compressImage(file);

        showStatus("Upload image ke IPFS…");
        const fd = new FormData();
        fd.append("file", fileToUpload, fileToUpload.name);
        const upFile = await fetchJSON("/api/ipfs/file", {
          method: "POST",
          body: fd,
        });
        const imageCid = extractCid(upFile.cid || upFile.url);
        const imageGateway = toHttps(imageCid);
        const fileSha256 = await sha256HexOfFile(fileToUpload);

        const ipMeta = {
          title: intent.title || fileToUpload.name,
          description: intent.prompt || "",
          image: imageGateway,
          imageHash: fileSha256,
          mediaUrl: imageGateway,
          mediaHash: fileSha256,
          mediaType: fileToUpload.type || "image/webp",
          creators: address
            ? [{ name: address, address, contributionPercent: 100 }]
            : [],
          aiMetadata: intent.prompt
            ? { prompt: intent.prompt, generator: "user", model: "rule-based" }
            : undefined,
        };

        showStatus("Upload IP metadata…");
        const upMeta = await fetchJSON("/api/ipfs/json", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(ipMeta),
        });
        const ipMetaCid = extractCid(upMeta.cid || upMeta.url);
        const ipMetadataURI = toIpfsUri(ipMetaCid);
        const ipMetadataHash = await keccakOfJson(ipMeta);

        const nftMeta = {
          name: `IP Ownership — ${ipMeta.title}`,
          description: "Ownership NFT for IP Asset",
          image: imageGateway,
          ipMetadataURI,
          attributes: [{ trait_type: "ip_metadata_uri", value: ipMetadataURI }],
        };

        showStatus("Upload NFT metadata…");
        const upNft = await fetchJSON("/api/ipfs/json", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(nftMeta),
        });
        const nftMetaCid = extractCid(upNft.cid || upNft.url);
        const nftMetadataURI = toIpfsUri(nftMetaCid);
        const nftMetadataHash = await keccakOfJson(nftMeta);

        showStatus("Submit tx: mint & register IP…");
        const client = await getClient();
        const res = await client.ipAsset.mintAndRegisterIp({
          spgNftContract: spgAddr,
          recipient: address as `0x${string}`,
          ipMetadata: {
            ipMetadataURI,
            ipMetadataHash,
            nftMetadataURI,
            nftMetadataHash,
          },
          allowDuplicates: true,
        });

        // tampilkan submitted link segera
        push(
          "agent",
          `Tx submitted ⏳
↗ View: ${explorerBase}/tx/${res.txHash}`
        );

        // tunggu konfirmasi (fallback polling 3 menit)
        const ok = await awaitConfirmOnStory(res.txHash as Hex);
        if (ok) {
          const ipIdLine = res.ipId ? `ipId: ${res.ipId}\n` : "";
          push(
            "agent",
            `Register success ✅
${ipIdLine}Tx: ${res.txHash}
Image: ${imageGateway}
IP Metadata: ${toHttps(ipMetaCid)}
NFT Metadata: ${toHttps(nftMetaCid)}
↗ View: ${explorerBase}/tx/${res.txHash}`
          );
          setToast("IP registered ✅");
          clearPlan();
        } else {
          showStatus("Tx masih pending di jaringan. Pantau link explorer di atas.");
        }
      } catch (e: any) {
        push("agent", `Register error: ${prettyErr(e)}`);
        setToast("Register error ❌");
      }
    }
  }

  const canSend = isConnected && prompt.trim().length > 0;

  /* ---------- UI ---------- */
  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6 overflow-x-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[280px,1fr] gap-6">
        {/* SIDEBAR (History) */}
        <aside className="rounded-2xl border border-white/10 bg-white/5 p-4 h-[calc(100vh-180px)] overflow-y-auto scrollbar-invisible">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm opacity-80">History</div>
            <button
              onClick={newChat}
              className="text-[11px] px-2 py-1 rounded-full border border-white/15 bg-white/5 hover:bg-white/10"
              title="Start a new chat"
            >
              New
            </button>
          </div>
          {messages.filter((m) => m.role === "you").length === 0 ? (
            <p className="text-xs opacity-60">
              There are no interactions yet. Write the prompt on the right.
            </p>
          ) : (
            <ul className="space-y-2 pr-1">
              {messages
                .filter((m) => m.role === "you")
                .map((m, i) => (
                  <li key={i} className="text-sm line-clamp-2">
                    {m.text}
                  </li>
                ))}
            </ul>
          )}
        </aside>

        {/* MAIN CHAT */}
        <section className="rounded-2xl border border-white/10 bg-white/5 h-[calc(100vh-180px)] overflow-hidden flex flex-col">
          {/* messages */}
          <div
            ref={chatScrollRef}
            className="flex-1 overflow-y-auto scrollbar-invisible"
          >
            <div className="mx-auto w-full max-w-[820px] px-3 py-4">
              {messages.length === 0 ? (
                <div className="text-xs opacity-60">
                  AI replies will appear here. Try:{" "}
                  <span className="badge">Swap 1 WIP &gt; USDC slippage 0.5%</span>{" "}
                  or{" "}
                  <span className="badge">Register this image IP, title "Sunset" by-nc</span>.
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((m, i) => (
                    <div
                      key={i}
                      className={`flex ${m.role === "you" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-3 border ${
                          m.role === "you"
                            ? "bg-sky-500/15 border-sky-400/30"
                            : "bg-white/6 border-white/10"
                        }`}
                      >
                        <pre className="whitespace-pre-wrap text-sm break-words">
                          {m.text}
                        </pre>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Plan — hanya tampil sebelum Confirm */}
              {plan && (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm opacity-70 mb-2">Plan</div>
                  <ol className="list-decimal pl-5 space-y-1 text-sm">
                    {plan.map((p: string, i: number) => <li key={i}>{p}</li>)}
                  </ol>
                  <div className="flex gap-2 mt-3">
                    <button
                      className="rounded-2xl bg-sky-500/90 hover:bg-sky-400 text-white px-4 py-2 inline-flex items-center gap-2"
                      onClick={onConfirm}
                    >
                      <Check className="h-4 w-4" /> Confirm
                    </button>
                    <button
                      className="rounded-2xl border border-white/10 px-4 py-2 inline-flex items-center gap-2"
                      onClick={clearPlan}
                    >
                      <X className="h-4 w-4" /> Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* composer */}
          <div className="shrink-0 border-t border-white/10 bg-gradient-to-t from-black/20 to-transparent card relative overflow-visible">
            <div className="mx-auto w-full max-w-[820px] px-3 py-3">
              <div className="relative flex items-center gap-2 rounded-2xl ring-1 ring-white/15 bg-white/5/30 backdrop-blur-md px-3 py-2 overflow-visible">
                {/* attach */}
                <button
                  aria-label="Attach image"
                  title="Attach Image (for Register IP)"
                  className="p-2 rounded-xl text-white/80 hover:text-white bg-transparent hover:bg-white/10 focus:bg-white/10 active:bg-white/20 transition"
                  onClick={() => fileRef.current?.click()}
                >
                  <Paperclip className="h-5 w-5" />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onPickFile(e.target.files?.[0] || undefined)}
                />

                {/* inline preview */}
                {previewUrl && (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="preview"
                      className="h-8 w-8 rounded-md object-cover opacity-90"
                    />
                    <button
                      className="absolute -top-1 -right-1 rounded-full border border-white/30 bg-black/60 p-0.5"
                      onClick={removeFile}
                      title="Remove image"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {/* textarea */}
                <textarea
                  ref={taRef}
                  rows={1}
                  className="flex-1 resize-none rounded-md bg-transparent px-2 py-2 text-base sm:text-lg placeholder:opacity-50 focus:outline-none scrollbar-invisible"
                  placeholder='Swap 1 WIP > USDC slippage 0.5%  |  Register this image IP, title "Sunset" by-nc'
                  value={prompt}
                  onChange={(e) => {
                    setPrompt(e.target.value);
                    handleAutoGrow(e.currentTarget);
                  }}
                  onKeyDown={(e) =>
                    e.key === "Enter" && (e.ctrlKey || e.metaKey) && onRun()
                  }
                />

                {/* send */}
                <button
                  className="relative z-10 p-2 rounded-xl bg-sky-500/90 hover:bg-sky-400 text-white disabled:opacity-50 disabled:cursor-not-allowed transition"
                  onClick={onRun}
                  disabled={!canSend}
                  title={
                    !isConnected
                      ? "Connect wallet to send"
                      : !prompt.trim()
                      ? "Type a prompt"
                      : "Send (Ctrl/⌘+Enter)"
                  }
                >
                  <Send className="h-5 w-5" />
                </button>

                {/* sprite di kanan-atas tombol */}
                <Image
                  src="/brand/superlee-sprite.png"
                  alt=""
                  width={48}
                  height={48}
                  priority
                  className="pointer-events-none select-none pixelated animate-float absolute -top-3 -right-3 w-12 h-12 z-20 drop-shadow-[0_10px_28px_rgba(34,211,238,.35)]"
                />
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-black/70 border border-white/10 px-4 py-3 text-sm shadow-glow">
          {toast}
        </div>
      )}
    </div>
  );
}
