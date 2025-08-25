import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
    "./src/app/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ai: {
          bg: "#0b0f1a",
          card: "rgba(255,255,255,0.06)",
          border: "rgba(255,255,255,0.12)",
          primary: "#60a5fa",
          accent: "#22d3ee",
          magenta: "#e879f9",
        },
      },
      backdropBlur: { xs: "2px" },
      boxShadow: {
        glow:
          "0 0 0 1px rgba(96,165,250,.35), 0 0 40px -6px rgba(34,211,238,.45)",
      },
      keyframes: {
        grid: {
          "0%": { backgroundPosition: "0px 0px" },
          "100%": { backgroundPosition: "60px 60px" },
        },
        pulseGlow: {
          "0%,100%": {
            opacity: "0.7",
            filter: "drop-shadow(0 0 12px rgba(34,211,238,.35))",
          },
          "50%": {
            opacity: "1",
            filter: "drop-shadow(0 0 20px rgba(96,165,250,.45))",
          },
        },
      },
      animation: {
        grid: "grid 30s linear infinite",
        pulseGlow: "pulseGlow 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config; 

export default config;
