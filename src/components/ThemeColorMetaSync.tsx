"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

type Props = { light: string; dark: string };

export default function ThemeColorMetaSync({ light, dark }: Props) {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const color = resolvedTheme === "dark" ? dark : light;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

    // kalau belum ada (harusnya ada dari metadata), buat manual
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = color;
  }, [resolvedTheme, light, dark]);

  return null;
}
