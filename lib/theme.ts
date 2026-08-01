/**
 * Momentum brand tokens — the SINGLE source of truth for CRM + portal color.
 * Mirrors momentumlandscapingut.com. No screen may hardcode a hex outside this file
 * (Tailwind classes reference these via tailwind.config.ts; CSS vars in globals.css
 * drive light/dark). Gold is reserved for WINS only (Closed Won, Paid).
 */
export const brand = {
  // surfaces (light)
  bg: "#fbfcfd",
  bgAlt: "#f3f7f9",
  card: "rgba(255,255,255,0.78)",
  cardSolid: "#ffffff",
  border: "#e3ebef",
  // surfaces (dark)
  bgDark: "#14202f",
  bgAltDark: "#1c2e44",
  cardDark: "rgba(28,46,68,0.72)",
  borderDark: "#2b3f57",
  // ink
  navy: "#1c2e44", // headings
  slate: "#5c7280", // body
  // brand
  teal: "#4a8fb5", // primary action
  tealHover: "#2f6c8e",
  ice: "#96b2be", // accent
  gold: "oklch(0.78 0.10 70)", // WINS ONLY
  // status
  red: "#c4573e",
} as const;

export type StageKey = "new" | "contacted" | "quote_sent" | "closed_won" | "not_qualified" | "stale";

/** Stage → chip classes (teal scale; gold for the win). Class names resolve to theme tokens. */
export const STAGE_STYLE: Record<StageKey, string> = {
  new: "bg-ice/25 text-navy dark:text-ice",
  contacted: "bg-teal/20 text-teal dark:text-ice",
  quote_sent: "bg-teal/35 text-teal dark:text-white",
  closed_won: "bg-gold/25 text-[oklch(0.45_0.10_70)] dark:text-gold",
  not_qualified: "bg-slate/15 text-slate",
  stale: "bg-slate/10 text-slate/70",
};

export const STAGE_LABEL: Record<StageKey, string> = {
  new: "New", contacted: "Contacted", quote_sent: "Quote Sent",
  closed_won: "Won", not_qualified: "Not Qualified", stale: "Stale",
};

/** Invoice status → chip classes. */
export const INVOICE_STYLE: Record<string, string> = {
  draft: "bg-slate/15 text-slate",
  sent: "bg-teal/20 text-teal",
  paid: "bg-gold/25 text-[oklch(0.45_0.10_70)] dark:text-gold",
  overdue: "bg-red/15 text-red",
  void: "bg-slate/10 text-slate/60",
  refunded: "bg-ice/25 text-navy dark:text-ice",
};
