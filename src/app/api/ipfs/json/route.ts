import { NextResponse } from "next/server";
import { PinataSDK, type PinResponse } from "pinata-web3";
import { keccak256, toHex } from "viem";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const PINATA_JWT = process.env.PINATA_JWT;
    const PINATA_GATEWAY = process.env.PINATA_GATEWAY;
    if (!PINATA_JWT) {
      return NextResponse.json({ error: "Missing PINATA_JWT" }, { status: 500 });
    }

    // Baca persis string yang dikirim client (jangan parse-json dulu)
    const raw = await req.text();
    if (!raw) {
      return NextResponse.json({ error: "Empty body" }, { status: 400 });
    }

    // Keccak256 atas bytes yang PERSIS akan di-upload
    const bytes = new TextEncoder().encode(raw);
    const keccak = keccak256(toHex(bytes));

    const pinata = new PinataSDK({ pinataJwt: PINATA_JWT, pinataGateway: PINATA_GATEWAY });

    // Upload EXACT bytes sebagai file JSON
    const file = new File([raw], "metadata.json", { type: "application/json" });
    const up: PinResponse = await pinata.upload.file(file);

    const cid = up.IpfsHash; // Pinata format
    const url =
      (PINATA_GATEWAY ? `${PINATA_GATEWAY}` : "https://ipfs.io") + `/ipfs/${cid}`;

    return NextResponse.json({ cid, url, keccak, raw: up }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
