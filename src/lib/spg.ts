// src/lib/spg.ts
import type { PublicClient } from "viem";

/** Alamat controller IP Asset (Story Aeneid 1315).
 *  Bisa dioverride via .env.local: NEXT_PUBLIC_STORY_IP_ASSET
 */
export const IP_ASSET_ADDR = (
  process.env.NEXT_PUBLIC_STORY_IP_ASSET ||
  "0xbe39E1C756e921BD25DF86e7AAa31106d1eb0424"
) as `0x${string}`;

/** OpenZeppelin MINTER_ROLE = keccak256("MINTER_ROLE") */
export const MINTER_ROLE =
  "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4c0f7b3c6ab5a02b5c" as `0x${string}`;

/** IERC165 id untuk AccessControl */
export const IACCESSCONTROL_IFACE = "0x7965db0b";

/** Minimal ABI untuk AccessControl.hasRole & supportsInterface */
export const ACCESS_CONTROL_ABI_MIN = [
  {
    type: "function",
    name: "supportsInterface",
    stateMutability: "view",
    inputs: [{ name: "interfaceId", type: "bytes4" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

export type RoleCheck = "granted" | "denied" | "unknown";

export function isHexAddr(s: string): s is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(s);
}

/** Ambil alamat SPG utama dari env (.env.local) */
export function getSpgFromEnv(): `0x${string}` | null {
  const s = (process.env.NEXT_PUBLIC_SPG_COLLECTION || "").trim();
  return isHexAddr(s) ? (s as `0x${string}`) : null;
}

/** Ambil fallback SPG dari env (.env.local) */
export function getFallbackSpgFromEnv(): `0x${string}` | null {
  const s =
    (process.env.NEXT_PUBLIC_SPG_FALLBACK ||
      process.env.NEXT_PUBLIC_SPG_PUBLIC ||
      "").trim();
  return isHexAddr(s) ? (s as `0x${string}`) : null;
}

/** Cek MINTER_ROLE menggunakan controller default (IP_ASSET_ADDR). */
export async function checkMinterRole(
  pc: PublicClient,
  spg: `0x${string}`
): Promise<RoleCheck> {
  return checkMinterRoleFor(pc, spg, IP_ASSET_ADDR);
}

/** Cek MINTER_ROLE terhadap controller tertentu (lebih akurat memakai sdkClient.ipAsset.address). */
export async function checkMinterRoleFor(
  pc: PublicClient,
  spg: `0x${string}`,
  controller: `0x${string}`
): Promise<RoleCheck> {
  try {
    const supports = await pc.readContract({
      address: spg,
      abi: ACCESS_CONTROL_ABI_MIN,
      functionName: "supportsInterface",
      args: [IACCESSCONTROL_IFACE as `0x${string}`],
    });
    if (!supports) return "unknown";
  } catch {
    return "unknown";
  }

  try {
    const has = await pc.readContract({
      address: spg,
      abi: ACCESS_CONTROL_ABI_MIN,
      functionName: "hasRole",
      args: [MINTER_ROLE, controller],
    });
    return has ? "granted" : "denied";
  } catch {
    return "unknown";
  }
}

/** Pesan singkat untuk kasus role memang tidak diberikan. */
export function explainMissingRole() {
  return "Koleksi SPG menolak mint. Pakai koleksi yang mengizinkan IP Asset (set NEXT_PUBLIC_SPG_COLLECTION atau NEXT_PUBLIC_SPG_FALLBACK).";
}
