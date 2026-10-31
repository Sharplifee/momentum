import { Check, Dot, Footnote, Row, RowCard, type Tone } from "@/components/crm/settings/ui";

export type ChecklistItem = { id: string; label: string; done: boolean };
export type SettingsRowData = { href: string; label: string; sub: string; tone: Tone };

/**
 * The Settings screen body: the launch checklist (read straight from
 * system_config.launch_checklist, which is only ever set from live probes) and
 * one row per settings sub-screen with a live/needs-you dot.
 */
export function SettingsPanel({ checklist, rows }: { checklist: ChecklistItem[]; rows: SettingsRowData[] }) {
  const done = checklist.filter((i) => i.done).length;
  const allDone = checklist.length > 0 && done === checklist.length;
  return (
    <div className="space-y-4">
      <section className="mo-card aiv-glow px-4 pb-1 pt-3.5">
        <div className="mb-1.5 flex items-baseline justify-between">
          <h2 className="font-display text-[15px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">Launch checklist</h2>
          <span className={`mo-eyebrow ${allDone ? "text-sage" : "text-gold"}`}>{checklist.length ? `${done} of ${checklist.length}` : "—"}</span>
        </div>
        {checklist.length === 0 && <p className="py-3 text-[13px] text-[color:var(--body)]">Nothing tracked yet.</p>}
        {checklist.map((i) => (
          <div key={i.id} className="flex items-start gap-3 border-t border-[color:var(--border)] py-2.5 first:border-t-0">
            <Check ok={i.done} />
            <span className={`min-w-0 flex-1 text-[13px] leading-snug ${i.done ? "text-[color:var(--body)]" : "text-[color:var(--ink)]"}`}>{i.label}</span>
          </div>
        ))}
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
