import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        moss: "#2f5233",
        clay: "#c46b3e",
        teal: "#4a8fb5",
        navy: "#1c2e44",
      },
      fontFamily: {
        sans: ["'DM Sans'", "'Instrument Sans'", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
