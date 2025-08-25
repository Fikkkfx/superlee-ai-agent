"use client";
import { useStoryClient } from "@/lib/storyClient";
import { useAccount } from "wagmi";
import { toHex } from "viem";
import { useState } from "react";

async function sha256Hex(file: File): Promise<`0x${string}`> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return toHex(new Uint8Array(hash), { size: 32 });
}

export default function RegisterIPPanel() {
  const { address, isConnected } = useAccount();
  const { getClient } = useStoryClient();
  const [file, setFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState("");

  async function uploadFileToIPFS(f: File) {
    const fd = new FormData();
    fd.append("file", f);
    const res = await fetch("/api/ipfs/file", { method: "POST", body: fd });
    if (!res.ok) throw new Error("file upload failed");
    return await res.json(); // { cid, url }
  }

  async function uploadJSONToIPFS(obj: any) {
    const res = await fetch("/api/ipfs/json", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(obj) });
    if (!res.ok) throw new Error("json upload failed");
    return await res.json(); // { cid, url, hash }
  }

  async function onSubmit() {
    try {
      if (!file) return;
      setStatus("Uploading image...");
      const media = await uploadFileToIPFS(file);
      const mediaHash = await sha256Hex(file);

      const ipMetadata = {
        title: file.name,
        description: prompt || "",
        image: media.url,
        imageHash: mediaHash,
        mediaUrl: media.url,
        mediaHash: mediaHash,
        mediaType: file.type,
        creators: address ? [{ name: address, address, contributionPercent: 100 }] : [],
        aiMetadata: prompt ? { prompt, generator: "user", model: "unknown" } : undefined,
      };

      setStatus("Uploading metadata...");
      const ipMetaUpload = await uploadJSONToIPFS(ipMetadata);

      const nftMetadata = {
        name: `IP Ownership — ${file.name}`,
        description: "Ownership NFT for IP Asset",
        image: media.url,
      };
      const nftMetaUpload = await uploadJSONToIPFS(nftMetadata);

      setStatus("Registering on Story...");
      const client = await getClient();
      const res = await client.ipAsset.mintAndRegisterIp({
        spgNftContract: "0xc32A8a0FF3beDDDa58393d022aF433e78739FAbc",
        ipMetadata: {
          ipMetadataURI: ipMetaUpload.url,
          ipMetadataHash: ipMetaUpload.hash,
          nftMetadataURI: nftMetaUpload.url,
          nftMetadataHash: nftMetaUpload.hash,
        },
      });

      setStatus(`Registered! ipId: ${res.ipId}\nTx: ${res.txHash}`);
    } catch (e: any) {
      setStatus(e?.message || "Register error");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        <div>
          <label>Prompt (optional)</label>
          <textarea value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Describe your work..." className="w-full min-h-[100px]"/>
        </div>
        <div>
          <label>Image</label>
          <input type="file" accept="image/*" onChange={e=>setFile(e.target.files?.[0]||null)} />
        </div>
        <div className="flex gap-2">
          <button onClick={onSubmit} disabled={!isConnected || !file}>Upload & Register</button>
        </div>
      </div>
      {status && <pre className="bg-gray-50 p-3 rounded-xl text-xs overflow-auto">{status}</pre>}
    </div>
  );
}