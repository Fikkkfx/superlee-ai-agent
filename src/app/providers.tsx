// src/app/providers.tsx
"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

function RKTheme({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    const root = document.documentElement;
    const dark = root.classList.contains("dark");
    setIsDark(dark);
    const obs = new MutationObserver(() =>
      setIsDark(root.classList.contains("dark"))
    );
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  return (
    <RainbowKitProvider
      theme={isDark ? darkTheme() : lightTheme()}
      modalSize="compact"
      showRecentTransactions={false}
    >
      {children}
    </RainbowKitProvider>
  );
}

const qc = new QueryClient();

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <RKTheme>{children}</RKTheme>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
