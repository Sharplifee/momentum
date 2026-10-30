/**
 * Momentum brand tokens — the SINGLE source of truth for CRM + portal color.
 * Mirrors tailwind.config.ts and the CSS variables in app/globals.css. No screen
 * may hardcode a hex outside those three files. Amber is reserved for WINS only
 * (Closed Won, Paid). Coral is the only red. Sage is the only green.
 *
 * The system is one dark theme: matte near-black, bone ink, one gradient
 * hairline (navy → glacier → bone → amber → coral). There is no light theme, so
 * `dark:` variants are never written — they never fired and left light-theme
 * ink on a dark surface.
 */
export const brand = {
  // surfaces
  bg: "#0a0a0a",
  bgAlt: "#0e0e0e",
  card: "#121212",
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.16)",
  // ink
  ink: "#f2efe8",
  body: "#9b9790",
  faint: "#66635c",
  // palette
  pine: "#0b1f4d",   // midnight navy — the badge's dark blue
  sea: "#7ac1c9",   // glacier — the badge's blue; primary accent (links, active, focus)
  bone: "#efe7d6",
  amber: "#e3a35f", // WINS ONLY
  coral: "#d9775c", // errors, overdue
  sage: "#86b67a",  // healthy, completed
  // the signature
  grad: "linear-gradient(90deg, #0b1f4d 0%, #7ac1c9 30%, #efe7d6 52%, #e3a35f 74%, #d9775c 100%)",
  // legacy aliases (same values as the tailwind tokens of the same name)
  navy: "#f2efe8",
  slate: "#9b9790",
  teal: "#7ac1c9",
  tealHover: "#5fb0ba",
  ice: "#d8d4cb",
  gold: "#e3a35f",
  red: "#d9775c",
} as const;

/** Chart series order — the gradient stops, read left to right. */
export const SERIES = ["#7ac1c9", "#e3a35f", "#efe7d6", "#86b67a", "#d9775c", "#0b1f4d"] as const;

/** Pipeline stage colors — a pipeline walks the hairline: sea → bone → amber. */
export const STAGE_COLOR: Record<"new" | "contacted" | "quote_sent" | "closed_won", string> = {
  new: "#7ac1c9",
  contacted: "#8fd0c6",
  quote_sent: "#efe7d6",
  closed_won: "#e3a35f",
};

export type StageKey = "new" | "contacted" | "quote_sent" | "closed_won" | "not_qualified" | "stale";

/** Stage → chip classes. Hairline chips: tinted border, tinted text, no fill. */
export const STAGE_STYLE: Record<StageKey, string> = {
  new: "border border-teal/50 text-teal",
  contacted: "border border-teal/30 text-ice",
  quote_sent: "border border-ice/40 text-navy",
  closed_won: "border border-gold/60 text-gold",
  not_qualified: "border border-white/10 text-slate",
  stale: "border border-white/10 text-slate/60",
};

export const STAGE_LABEL: Record<StageKey, string> = {
  new: "New", contacted: "Contacted", quote_sent: "Quote Sent",
  closed_won: "Won", not_qualified: "Not Qualified", stale: "Stale",
};

/** Invoice status → chip classes. */
export const INVOICE_STYLE: Record<string, string> = {
  draft: "border border-white/10 text-slate",
  sent: "border border-teal/50 text-teal",
  paid: "border border-gold/60 text-gold",
  overdue: "border border-red/60 text-red",
  void: "border border-white/10 text-slate/60",
  refunded: "border border-ice/40 text-ice",
};
