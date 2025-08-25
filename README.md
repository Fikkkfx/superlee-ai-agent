# Superlee AI Agent — Swap (PiperX) + Register IP (Story)

An **AI‑first dApp** built with Next.js that lets users:

* **Swap tokens** on Story Chain via **PiperX Aggregator Router**
* **Register IP** (image + metadata/prompt) on **Story Protocol**
* Drive both actions from a **single natural‑language prompt** (with optional image attach)

The project ships with a modern, animated UI, wallet chips (IP balance & total IP registered), dark mode, and a small rule‑based intent engine that parses prompts like:

> `Swap 1 WIP > USDC slippage 0.5%`
> `Register this image IP, title "Sunset" by-nc`

Works on **Story Aeneid Testnet** by default. Flip to Mainnet by changing envs.

---

## ✨ Features

* **AI Prompt Orchestration** — One wide prompt box + paperclip attach. The agent extracts intent (`swap`/`register`), entities (amount, tokens, slippage, title, license), then proposes a **Plan** → *Confirm* → execute.
* **PiperX Aggregator Swap** — Quote → approve → route execution using `executeMultiPath(universalRoutes)`.
* **Story Protocol IP Registration** — Upload image & JSON metadata to IPFS (Pinata), compute SHA‑256, then `mintAndRegisterIp` on SPG collection.
* **Wallet Overview Chips** — IP balance + total IP registered in the top‑right.
* **History + AI Replies** — Chat‑like response panel above the prompt.
* **Dark Mode** — Via `next-themes`, synced with RainbowKit’s theme.
* **Animated Background** — Subtle neon grid + (optional) pixel mascot near the prompt.

---

## 🧱 Tech Stack

* **Next.js (App Router)**, **TypeScript**, **TailwindCSS**
* **wagmi + viem** (Story Chain), **RainbowKit** (wallet UI)
* **@story-protocol/core-sdk** for on‑chain registration
* **Pinata** (IPFS uploads) via Next API routes

---

## 📦 Project Structure

```
ai-agent-dapp/
├─ .env.local                 # your secrets (see template below)
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx          # background + Providers + Topbar
│  │  ├─ page.tsx            # history + AI reply + prompt panel
│  │  ├─ globals.css         # theme variables + grid/kenburns
│  │  └─ api/ipfs/
│  │     ├─ file/route.ts    # POST -> uploads image to IPFS (Pinata)
│  │     └─ json/route.ts    # POST -> uploads JSON to IPFS (Pinata)
│  ├─ components/
│  │  ├─ PromptAgent.tsx     # the main AI prompt UI + actions
│  │  ├─ Topbar.tsx          # title, wallet connect, theme toggle
│  │  └─ WalletPanel.tsx     # (optional) balance helpers
│  └─ lib/
│     ├─ agent/
│     │  ├─ engine.ts        # rule‑based intent parser (swap/register)
│     │  └─ tokens.ts        # symbol/alias → token address mapping
│     ├─ piperx.ts           # aggregator helpers (quote/approve/swap)
│     ├─ storyClient.ts      # Story SDK client bound to wagmi wallet
│     ├─ wagmi.ts            # chains + RainbowKit config
│     └─ abi/
│        ├─ erc20.ts
│        └─ aggregator_abi.ts
└─ README.md
```

---

## ⚙️ Environment (`.env.local`)

Copy this template and adjust per network.

```bash
# Story Chain (Aeneid testnet)
NEXT_PUBLIC_STORY_CHAIN_ID=1315
NEXT_PUBLIC_STORY_RPC=https://aeneid.storyrpc.io

# PiperX (Aeneid)
NEXT_PUBLIC_PIPERX_WIP=0x1514000000000000000000000000000000000000
NEXT_PUBLIC_PIPERX_AGGREGATOR=0xf706FCb6C1E580B5070fAB19e8C1b44f095b3640
NEXT_PUBLIC_PIPERX_AGGREGATOR_API=https://piperxdb.piperxprotocol.workers.dev

# Token addresses the agent can resolve by symbol (optional; prompt can also use 0x...)
NEXT_PUBLIC_TOKEN_USDC=
NEXT_PUBLIC_TOKEN_WETH=

# Pinata (required for IPFS uploads via API routes)
PINATA_JWT=eyJhbGciOi...
PINATA_GATEWAY=YOUR-GATEWAY.mypinata.cloud  # optional

# WalletConnect Cloud project ID (optional if you use basic connectors)
NEXT_PUBLIC_WC_PROJECT_ID=
```

> **Tip:** You can also type token addresses directly in the prompt, e.g. `Swap 1 0xWIP... > 0xUSDC...`.

---

## 🚀 Getting Started

```bash
npm i
npm run dev
# open http://localhost:3000
```

1. Connect wallet (Story **Aeneid 1315**).
2. Type a prompt (examples below).
3. Review the **Plan**, then **Confirm** to execute.

---

## 🧠 Prompt Examples

* **Swap**: `Swap 1 WIP > USDC slippage 0.5%`
* **Swap (aliases)**: `tukar 0,25 ip ke usdc slip 1%`
* **Swap (addresses)**: `swap 2 0xWIP... -> 0xUSDC...`
* **Register IP**: `Register this image IP, title "Sunset" by-nc`

> The agent understands `>`, `->`, `to`, `ke`, decimals with `,` or `.` and basic licenses (`by`, `by-nc`, `cc0`, `arr`, ...).

---

## 🔩 How It Works

### 1) Intent Engine (`lib/agent/engine.ts`)

A tiny rule‑based parser:

* Detects `swap` or `register` intent.
* Extracts amount, tokenIn/tokenOut (symbol/alias/address), optional `slippage`.
* Extracts register details: `title "..."`, optional license, and free‑form prompt.
* Returns either `{ type: "ask", question }` when info is incomplete, or `{ type: "ok", plan, intent }`.

### 2) Token Resolution (`lib/agent/tokens.ts`)

Maps symbols/aliases to addresses using environment variables (e.g., `WIP`, `USDC`). If not set, the agent asks you to provide addresses or you can type `0x...` directly.

### 3) Swap Flow (`lib/piperx.ts`)

1. Get token `decimals` via viem.
2. `getQuote` from the PiperX aggregator API → `universalRoutes`.
3. `approveForAggregator(tokenIn, amount)` if needed.
4. `executeMultiPath(universalRoutes)` on the aggregator router.

### 4) Register Flow (`app/api/ipfs/*` + `storyClient.ts`)

1. Upload the image to IPFS (Pinata) → get URL + CID.
2. Compute SHA‑256 in browser for the file; server computes hash for JSON.
3. Upload IP metadata JSON (includes image URLs, hashes, creators, AI prompt).
4. `mintAndRegisterIp` on Story (public SPG collection on Aeneid in this starter).

---

## 🖥️ UI/UX Notes

* One **wide prompt** with paperclip (attach image). The send button is disabled when empty.
* **History** (left) & **AI reply** panel (right/center) above the prompt.
* **Wallet chips** on the top‑right: IP balance + total IP registered.
* **Dark mode** toggle; RainbowKit theme is synced.
* Animated background + optional pixel mascot near the prompt (sprite).

---

## 🔐 Security

* No private keys stored client‑side; all on‑chain actions use your connected wallet.
* IPFS uploads use **server routes** with your **Pinata JWT** from `.env.local`.
* Never commit `.env.local` — it’s ignored by default.

---

## 🧰 Troubleshooting

* **RainbowKit `getDefaultConfig` not a function** → ensure `@rainbow-me/rainbowkit@^2` + `wagmi@^2` installed and imports match examples.
* **"No QueryClient set"** → Wrap app in `QueryClientProvider` (already done in `Providers`).
* **SSR mismatch (dangerouslySetInnerHTML)** → RainbowKit is rendered **after mount** (see `providers.tsx`) to avoid mismatch with `next-themes`.
* **Windows `rm -rf`** → use PowerShell: `Remove-Item -Recurse -Force node_modules,.next,package-lock.json`.
* **Tokens unknown** → fill `NEXT_PUBLIC_TOKEN_*` or write 0x addresses in prompt.

---

## 🔁 Mainnet Switch

* Change `wagmi.ts` chains to Story Mainnet (1514) and RPC.
* Update PiperX aggregator address & API for mainnet.
* Use your own SPG collection for production IP registration.

---

## 🗺️ Roadmap

* Natural‑language slippage & deadline enforcement at execution time
* Built‑in token list & symbol autocomplete
* IP licensing presets (PIL) after mint
* Toasts + explorer links per tx
* Optional LLM to rewrite/validate prompts

---

## 📝 License

MIT — see [LICENSE](LICENSE) (or choose one that fits your org).

> PRs and issues are welcome! If you ship something with this starter, tag me ✨
