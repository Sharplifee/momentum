import { Check, Dot, Footnote, Row, RowCard, type Tone } from "@/components/crm/settings/ui";

export type ChecklistItem = { id: string; label: string; done: boolean };
export type SettingsRowData = { href: string; label: string; sub: string; tone: Tone };

/* Plain names for the probes. The stored label is the engineer's evidence
   (commit hashes, SQL, HTTP codes) — it stays, one line, under the name. */
const TITLE: Record<string, string> = {
  anthropic_credits: "Norma's AI credits",
  sms_inbound_signature: "Customer replies reach the CRM",
  sms_outbound: "Outbound texts · SMS budget",
  eod_email: "End-of-day email",
  uptime_alerting: "Outage alerts",
  crew_location: "Crew location tracking",
  meta_capi: "Meta conversions",
  meta_leadgen_live: "Meta lead ads → CRM",
  meta_form_id: "Meta lead form",
  meta_app_secret: "Meta app secret",
  campaigns_paused: "Ad campaigns running",
  work_the_12: "Follow up the Meta leads",
  website_form: "Website quote form",
  stripe_webhook: "Stripe payments",
  open_api_doors: "API doors locked",
  no_fake_data: "No fake data",
};
const titleOf = (i: ChecklistItem) => TITLE[i.id] ?? i.id.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function Item({ i }: { i: ChecklistItem }) {
  return (
    <details className="group border-t border-[color:var(--border)] first:border-t-0">
      <summary className="flex cursor-pointer list-none items-start gap-3 py-2.5 [&::-webkit-details-marker]:hidden">
        <Check ok={i.done} />
        <span className="min-w-0 flex-1">
          <span className={`block text-[14px] leading-snug ${i.done ? "text-[color:var(--body)]" : "text-[color:var(--ink)]"}`}>{titleOf(i)}</span>
          <span className="mt-0.5 block truncate text-[12px] text-[color:var(--faint)] group-open:hidden">{i.label}</span>
        </span>
        <span className="mo-mono shrink-0 pt-0.5 text-[11px] text-[color:var(--faint)]">{i.done ? "live" : "open"}</span>
      </summary>
      <p className="-mt-1 pb-3 pl-8 text-[12.5px] leading-snug text-[color:var(--body)]">{i.label}</p>
    </details>
  );
}

/**
 * The Settings screen body: the launch checklist (read straight from
 * system_config.launch_checklist, which is only ever set from live probes) and
 * one row per settings sub-screen with a live/needs-you dot. Open items first,
 * each with a short name; the probe evidence opens on tap.
 */
export function SettingsPanel({ checklist, rows }: { checklist: ChecklistItem[]; rows: SettingsRowData[] }) {
  const open = checklist.filter((i) => !i.done);
  const done = checklist.filter((i) => i.done);
  const allDone = checklist.length > 0 && open.length === 0;
  return (
    <div className="space-y-4">
      <section className="mo-card aiv-glow px-4 pb-1 pt-3.5">
        <div className="mb-1.5 flex items-baseline justify-between">
          <h2 className="font-display text-[15px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">Launch checklist</h2>
          <span className={`mo-eyebrow ${allDone ? "text-sage" : "text-gold"}`}>{checklist.length ? `${done.length} of ${checklist.length}` : "—"}</span>
        </div>
        {checklist.length === 0 && <p className="py-3 text-[13px] text-[color:var(--body)]">Nothing tracked yet.</p>}
        {open.map((i) => <Item key={i.id} i={i} />)}
        {done.length > 0 && (
          <details className="border-t border-[color:var(--border)]">
            <summary className="mo-eyebrow cursor-pointer list-none py-2.5 text-sage [&::-webkit-details-marker]:hidden">{done.length} live · show</summary>
            {done.map((i) => <Item key={i.id} i={i} />)}
          </details>
        )}
      </section>

      <RowCard>
        {rows.map((r) => (
          <Row key={r.href} href={r.href} lead={<Dot tone={r.tone} />} label={r.label} sub={r.sub} />
        ))}
      </RowCard>

      <Footnote>Green dot = live · amber = needs you · coral = broken<br />Edits save the moment you make them</Footnote>
    </div>
  );
}
