/**
 * Plain-English lines for the lead timeline and the message thread.
 * Every string here is derived from a stored row — nothing is invented.
 */

const TZ = "America/Denver";

export const SOURCE_NAME: Record<string, string> = {
  website: "website", meta_lead_ad: "Meta lead ad", meta: "Meta lead ad", phone: "phone call",
  referral: "referral", door: "door knock", other: "other",
};

export const STAGE_NAME: Record<string, string> = {
  new: "New", contacted: "Contacted", quote_sent: "Quote sent", quote_scheduled: "Quote visit booked",
  closed_won: "Won", not_qualified: "Not qualified", stale: "Stale",
};

export function fmtPhone(p: string | null | undefined): string {
  if (!p) return "";
  const d = p.replace(/\D/g, "").replace(/^1(\d{10})$/, "$1");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p;
}

export function denverDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
}
export function todayDenver(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}
export function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
}
/** "4:53 PM" today, "Oct 29" otherwise — the mono column the design uses. */
export function fmtStamp(iso: string): string {
  return denverDay(iso) === todayDenver()
    ? fmtClock(iso)
    : new Date(iso).toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric" });
}
/** "Today" / "Yesterday" / "Monday, Oct 26" — day separators. */
export function fmtDayLabel(iso: string): string {
  const day = denverDay(iso);
  const today = todayDenver();
  if (day === today) return "Today";
  const y = new Date(Date.now() - 86400_000).toLocaleDateString("en-CA", { timeZone: TZ });
  if (day === y) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-US", { timeZone: TZ, weekday: "long", month: "short", day: "numeric" });
}
export function ago(iso: string): string {
  const m = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${Math.floor(m)} min ago`;
  if (m < 1440) return `${Math.floor(m / 60)} h ago`;
  return `${Math.floor(m / 1440)} d ago`;
}

export type MsgMeta = { delivery?: string; delivery_at?: string; dry_run?: boolean; sandboxed?: boolean; provider_response?: any; failure_code?: string } | null;

/** What actually happened to an outbound text, from messages.meta. */
export function deliveryState(meta: MsgMeta): { label: string; tone: "ok" | "bad" | "dim" } {
  if (!meta) return { label: "sent", tone: "dim" };
  if (meta.delivery === "SMS_DELIVERED") return { label: "delivered", tone: "ok" };
  if (meta.delivery === "SMS_FAILED") return { label: "failed", tone: "bad" };
  if (meta.dry_run) return { label: "practice send", tone: "dim" };
  const notes = (meta.provider_response?.messages ?? []) as unknown[];
  if (notes.some((n) => typeof n === "string" && /discard|aborted|budget|disabled/i.test(n))) return { label: "not sent", tone: "bad" };
  if (meta.provider_response?.error) return { label: "failed", tone: "bad" };
  if (meta.sandboxed) return { label: "sent (sandbox)", tone: "dim" };
  return { label: "sent", tone: "dim" };
}

export function senderName(sender: string | null): string {
  return sender === "nora" ? "Norma" : sender === "staff" ? "Team" : sender === "system" ? "System" : "Customer";
}

const excerpt = (s: string, n = 70) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export function humanizeLeadEvent(e: { type: string; detail: any; actor: string | null }): string {
  const d = e.detail ?? {};
  const t = e.type;
  if (t === "created") return `Lead created from ${SOURCE_NAME[d.source] ?? d.source ?? "the website"}`;
  if (t === "repeat_submission") return "Submitted the form again";
  if (t === "stage_change") return `Stage set to ${STAGE_NAME[d.to] ?? d.to}${e.actor && e.actor !== "system" ? ` by ${e.actor}` : ""}`;
  if (t.startsWith("nudge_sent_")) {
    const which = t.replace("nudge_sent_nudge_", "").replace("h", " h");
    return `Follow-up text sent · ${which} check-in`;
  }
  if (t === "job_booked") return `Norma booked a visit${d.date ? ` for ${new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}` : ""}`;
  if (t === "note") return `Norma noted: ${excerpt(String(d.note ?? ""))}`;
  if (t === "polite_close_sent") return "Polite close text sent";
  if (t === "quote_visit_booked") return "Quote visit booked";
  return t.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function humanizeMessage(m: { direction: string; sender: string | null; body: string; meta: MsgMeta }): string {
  if (m.direction === "inbound") return `Customer replied “${excerpt(m.body)}”`;
  const who = senderName(m.sender);
  const state = deliveryState(m.meta);
  return `${who} texted “${excerpt(m.body, 56)}” · ${state.label}`;
}
