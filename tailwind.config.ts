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
        // brand
        navy: { DEFAULT: "#1c2e44", dark: "#14202f" },
        slate: "#5c7280",
        teal: { DEFAULT: "#4a8fb5", hover: "#2f6c8e" },
        ice: "#96b2be",
        gold: "oklch(0.78 0.10 70)",
        red: "#c4573e",
        surface: { DEFAULT: "#fbfcfd", alt: "#f3f7f9", card: "#ffffff" },
      },
      fontFamily: {
        sans: ["var(--font-body)", "Instrument Sans", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "DM Sans", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "12px", "2xl": "16px", "3xl": "20px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(28,46,68,0.04), 0 4px 16px rgba(28,46,68,0.06)",
        pop: "0 8px 30px rgba(28,46,68,0.12)",
      },
      backdropBlur: { xs: "2px" },
    },
  },
  plugins: [],
};
export default config;
