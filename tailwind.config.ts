import type { Config } from "tailwindcss";

/**
 * Momentum design system — "field + evening" edition.
 *
 * Matte near-black surfaces, bone-white ink, one signature gradient hairline
 * (navy → glacier → bone → amber → coral: the badge's blues into a south-valley evening),
 * tight grotesk display type, uppercase mono micro-labels. Nothing frosted,
 * nothing glowing. Colors mirror lib/theme.ts and the CSS variables in
 * globals.css — those three files are the only places a hex may live.
 *
 * Token names from the previous system (teal / navy / slate / ice / gold)
 * are kept so every existing class repaints without a rewrite:
 *   navy  → ink (bone)        slate → body (warm grey)
 *   teal  → sea accent        ice   → light warm grey
 *   gold  → amber (wins)      red   → coral
 */
const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // legacy aliases kept so any stragglers still resolve to brand, not gray
        moss: "#1d5f58",
        clay: "#d9775c",
        // semantic (legacy names, new values)
        navy: { DEFAULT: "#f2efe8", dark: "#ffffff" },
        slate: "#9b9790",
        teal: { DEFAULT: "#7ac1c9", hover: "#5fb0ba" },
        ice: "#d8d4cb",
        gold: "#e3a35f",
        red: "#d9775c",
        green: { DEFAULT: "#86b67a" },
        surface: { DEFAULT: "#0a0a0a", alt: "#0e0e0e", card: "#121212" },
        // named palette for new code
        bone: "#f2efe8",
        pine: "#0b1f4d",
        sea: "#7ac1c9",
        amber: "#e3a35f",
        coral: "#d9775c",
        sage: "#86b67a",
        line: "rgba(255,255,255,0.08)",
      },
      fontFamily: {
        sans: ["var(--font-body)", "Inter", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Inter Tight", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        xl: "8px", "2xl": "10px", "3xl": "12px",
      },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.03) inset, 0 1px 2px rgba(0,0,0,0.5)",
        pop: "0 16px 40px rgba(0,0,0,0.6)",
        glow: "0 0 0 1px rgba(58,169,154,0.35)",
      },
      backgroundImage: {
        ribbon: "var(--grad)",
      },
      letterSpacing: {
        micro: "0.14em",
      },
      backdropBlur: { xs: "2px" },
    },
  },
  plugins: [],
};
export default config;
