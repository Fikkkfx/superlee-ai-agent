// src/app/api/ipfs/file/route.ts
import { PinataSDK } from "pinata-web3";

export const runtime = "nodejs"; // paksa Node runtime (lebih cocok untuk pinata-web3)

export async function POST(req: Request) {
  try {
    const PINATA_JWT = process.env.PINATA_JWT;
    const PINATA_GATEWAY = process.env.PINATA_GATEWAY || "ipfs.io";
    if (!PINATA_JWT) {
      return new Response("Missing PINATA_JWT", { status: 500 });
    }

    const pinata = new PinataSDK({
      pinataJwt: PINATA_JWT,
      pinataGateway: PINATA_GATEWAY,
    });

    const fd = await req.formData();

    // ==== Ambil field "file" tanpa mengandalkan typing DOM ====
    // 1) coba pakai get() bila ada
    let maybeFile: unknown = null;
    const maybeGet = (fd as any)?.get;
    if (typeof maybeGet === "function") {
      maybeFile = maybeGet.call(fd, "file");
    } else {
      // 2) fallback: iterasi pasangan [key, value]
      for (const [k, v] of (fd as any as Iterable<[string, unknown]>)) {
        if (k === "file") {
          maybeFile = v;
          break;
        }
      }
    }

    if (!(maybeFile instanceof File)) {
      return new Response("No file", { status: 400 });
    }
    const file = maybeFile as File;
    // ==========================================================

    const up = await pinata.upload.file(file); // PinResponse
    const cid = up.IpfsHash;                   // properti yang benar pada pinata-web3
    const url = `https://${PINATA_GATEWAY}/ipfs/${cid}`;

    return Response.json({ cid, url });
  } catch (e: any) {
    return new Response(String(e?.message || e), { status: 500 });
  }
}
