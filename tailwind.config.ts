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
  darkMode: ["class", '[data-theme="evening"]'],
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Semantic tokens backed by CSS variables (see app/globals.css §5.4)
        bg: "var(--bg)",
        surface: {
          DEFAULT: "var(--surface)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
          card: "var(--surface)",
          alt: "var(--surface-2)",
        },
        text: { DEFAULT: "var(--text)", muted: "var(--text-muted)", faint: "var(--text-faint)" },
        line: { DEFAULT: "var(--border)", strong: "var(--border-strong)" },
        accent: { DEFAULT: "var(--accent)", hover: "var(--accent-hover)", on: "var(--on-accent)" },
        primary: { DEFAULT: "var(--primary-bg)", fg: "var(--primary-fg)", hover: "var(--primary-hover)" },
        success: "var(--success)",
        win: "var(--win)",
        danger: "var(--danger)",
        info: "var(--info)",
        // Keep legacy aliases so existing classes still repaint
        moss: "#1d5f58",
        clay: "#d9775c",
        navy: { DEFAULT: "#f2efe8", dark: "#ffffff" },
        slate: "#9b9790",
        teal: { DEFAULT: "#7ac1c9", hover: "#5fb0ba" },
        ice: "#d8d4cb",
        gold: "#e3a35f",
        red: "#d9775c",
        green: { DEFAULT: "#86b67a" },
        bone: "#f2efe8",
        pine: "#0b1f4d",
        sea: "#7ac1c9",
        amber: "#e3a35f",
        coral: "#d9775c",
        sage: "#86b67a",
      },
      fontFamily: {
        sans: ["var(--font-body)", "Inter", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Inter Tight", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        "2xs": ["11px", { lineHeight: "1.3", letterSpacing: "0.08em" }],
        xs: ["12px", { lineHeight: "1.35" }],
        sm: ["13px", { lineHeight: "1.45" }],
        base: ["15px", { lineHeight: "1.5" }],
        md: ["17px", { lineHeight: "1.45" }],
        lg: ["20px", { lineHeight: "1.3", letterSpacing: "-0.015em" }],
        xl: ["24px", { lineHeight: "1.2", letterSpacing: "-0.02em" }],
        "2xl": ["30px", { lineHeight: "1.1", letterSpacing: "-0.028em" }],
        "3xl": ["38px", { lineHeight: "1.05", letterSpacing: "-0.035em" }],
      },
      spacing: { 4.5: "18px", 13: "52px", 14: "56px", 18: "72px", tap: "var(--tap)" },
      minHeight: { tap: "var(--tap)", "tap-min": "var(--tap-min)" },
      minWidth: { tap: "var(--tap)", "tap-min": "var(--tap-min)" },
      borderRadius: { control: "10px", card: "14px", sheet: "24px", chip: "999px", xl: "8px", "2xl": "10px", "3xl": "12px" },
      boxShadow: { 1: "var(--shadow-1)", pop: "var(--shadow-pop)", focus: "var(--focus-ring)" },
      transitionTimingFunction: { out: "cubic-bezier(.22,1,.36,1)", in: "cubic-bezier(.55,0,1,.45)", inout: "cubic-bezier(.65,0,.35,1)" },
      transitionDuration: { press: "90ms", fast: "160ms", base: "260ms", slow: "420ms" },
      zIndex: { header: "30", tabs: "30", fab: "35", sheet: "50", toast: "60", gate: "100" },
      backgroundImage: { ribbon: "var(--grad)" },
      letterSpacing: { micro: "0.14em" },
      backdropBlur: { xs: "2px" },
    },
  },
  plugins: [],
};
export default config;
