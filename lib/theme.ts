/**
 * Status → Tailwind class mappings. This file holds NO color values.
 *
 * Color lives in two places, and neither of them is here:
 *   • `tailwind.config.ts` — the palette behind class names like `bg-teal/20`
 *   • `app/globals.css`    — the CSS custom properties (`--bg`, `--ink`, …)
 *
 * This file used to export a `brand` object claiming to be "the SINGLE source
 * of truth for CRM + portal color." It stopped being true at the violet
 * repaint on 2026-07-22 and was dead code by the time it was removed on
 * 2026-08-03 — nothing imported it, and its light teal/navy hexes described a
 * UI that no longer existed. A second set of color values that nothing reads
 * is worse than none: it reads as authoritative and quietly misleads.
 *
 * What remains is the semantic layer — which status gets which treatment.
 * The class strings resolve through tailwind.config.ts, so a repaint of the
 * palette repaints these automatically and correctly.
 *
 * Gold is reserved for WINS only (Closed Won, Paid).
 */

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
