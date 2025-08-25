// src/lib/agent/engine.ts

export type Ask = { type: "ask"; question: string };

export type RegisterIntent = {
  kind: "register";
  title: string;
  license?: string;   // bebas, mis. "by-nc", "cc0", "by", dst (opsional)
};

type PlanOK = { type: "plan"; plan: string[]; intent: RegisterIntent };

/** Pesan bantuan default saat prompt belum dikenali */
function ask(msg?: string): Ask {
  return {
    type: "ask",
    question:
      msg ||
      'Write: “Register this image IP, title "Sunset" by-nc” (license opsional).',
  };
}

/** Ambil title & license dari berbagai variasi kalimat */
function parseRegisterCommand(input: string): { title?: string; license?: string } | null {
  const s = input.trim();

  // 1) Judul di dalam kutip
  //    Register this image IP, title "Sunset" by-nc
  const q = s.match(/title\s*["'“”]([^"'“”]+)["'“”]\s*(.*)$/i);
  if (q) {
    const title = q[1].trim();
    const rest = q[2] || "";
    const lic =
      (rest.match(/\b(?:license\s+)?([a-z0-9\-+_]+)\b/i)?.[1] || "").trim() || undefined;
    return { title, license: lic?.toLowerCase() };
  }

  // 2) Tanpa kutip — ambil kata setelah "title" sampai ketemu kata kunci lisensi/akhir
  //    Register this image IP title Sunset by-nc
  const m = s.match(/title\s+(.+?)\s*(?:\b(?:license|by|cc0|nc|nd|sa)\b.*)?$/i);
  if (m) {
    const title = m[1].trim().replace(/[,.]$/, "");
    // cari license di bagian akhir kalimat
    const lic =
      (s.match(/\b(?:license\s+)?(cc0|by(?:-[a-z]+)*|nc|nd|sa)\b/i)?.[1] || "").trim() ||
      undefined;
    return { title, license: lic?.toLowerCase() };
  }

  // 3) Bentuk lain yang masih ada "register" + "title"
  if (/^\s*register/i.test(s) && /\btitle\b/i.test(s)) {
    // coba ambil sisa kata setelah "title"
    const t2 = s.split(/title/i)[1]?.trim() || "";
    const title = t2.replace(/^["'“”]|["'“”]$/g, "").split(/\s+(?:license|by|cc0|nc|nd|sa)\b/i)[0]?.trim();
    if (title) {
      const lic =
        (s.match(/\b(?:license\s+)?(cc0|by(?:-[a-z]+)*|nc|nd|sa)\b/i)?.[1] || "").trim() ||
        undefined;
      return { title, license: lic?.toLowerCase() };
    }
  }

  return null;
}

/** Parser intent — register-only */
export async function decide(text: string): Promise<Ask | PlanOK> {
  const parsed = parseRegisterCommand(text);
  if (!parsed || !parsed.title) {
    return ask();
  }

  const intent: RegisterIntent = {
    kind: "register",
    title: parsed.title,
    license: parsed.license,
  };

  const plan = [
    `Parse: Register IP, title "${intent.title}"${intent.license ? ` license ${intent.license}` : ""}`,
    "Optimizing image",
    "Upload image ke IPFS",
    "Upload IP metadata",
    "Upload NFT metadata",
    "Submit tx: mint & register IP",
    "Show tx hash & link explorer",
  ];

  return { type: "plan", plan, intent };
}
