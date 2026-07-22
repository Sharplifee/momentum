import type { Config } from "tailwindcss";

/** Colors mirror lib/theme.ts (brand tokens). darkMode via class on <html>. */
const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // legacy aliases kept so any stragglers still resolve to brand, not gray
        moss: "#2f5233",
        clay: "#c46b3e",
        // brand — Aivora-inspired dark violet system (Connor 2026-07-22)
        navy: { DEFAULT: "#e9ecf8", dark: "#f4f5fb" },      // was heading-dark; app is dark now, so this IS the ink
        slate: "#98a1bd",                                     // muted body text on dark
        teal: { DEFAULT: "#8b7cf6", hover: "#7263e8" },     // primary accent → violet (name kept so every class repaints)
        ice: "#a5b0f0",                                       // soft periwinkle accents
        gold: "#e5b95e",
        red: "#e0655a",
        green: { DEFAULT: "#4ade80" },
        surface: { DEFAULT: "#0b0e17", alt: "#111527", card: "#151a2c" },
      },
      fontFamily: {
        sans: ["var(--font-body)", "Instrument Sans", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "DM Sans", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "12px", "2xl": "16px", "3xl": "20px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.3), 0 8px 24px rgba(0,0,0,0.25)",
        pop: "0 12px 40px rgba(0,0,0,0.5)", glow: "0 0 24px rgba(139,124,246,0.25)",
      },
      backdropBlur: { xs: "2px" },
    },
  },
  plugins: [],
};
export default config;
