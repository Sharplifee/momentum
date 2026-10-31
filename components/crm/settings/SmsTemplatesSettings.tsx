"use client";

import { useState } from "react";
import { Sheet, Field, INPUT } from "@/components/crm/Sheet";
import { Button } from "@/components/ui";
import { Row, RowCard, titleCase } from "@/components/crm/settings/ui";
import { Switch, useSettingsSave, SaveStatus } from "@/components/crm/settings/client";

export type TemplateRow = { id: number; name: string; body: string; sequence_order: number | null; delay_minutes: number | null; active: boolean };

const FIELD_RE = /\{[a-z_]+\}/g;
const fields = (s: string) => Array.from(new Set(s.match(FIELD_RE) ?? []));
const delayLabel = (m: number | null) => m == null ? null : m === 0 ? "sent right away" : m % 1440 === 0 ? `after ${m / 1440} day${m / 1440 === 1 ? "" : "s"}` : m % 60 === 0 ? `after ${m / 60} h` : `after ${m} min`;

export function SmsTemplatesSettings({ templates }: { templates: TemplateRow[] }) {
  const { save, busy, msg } = useSettingsSave();
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [body, setBody] = useState("");
  const [delay, setDelay] = useState("");
  const [err, setErr] = useState("");

  const open = (t: TemplateRow) => { setEditing(t); setBody(t.body); setDelay(t.delay_minutes != null ? String(t.delay_minutes) : ""); setErr(""); };

  async function submit() {
    if (!editing) return;
    const before = fields(editing.body), after = fields(body);
    const dropped = before.filter((f) => !after.includes(f));
    if (dropped.length) { setErr(`Keep the fields in braces — ${dropped.join(", ")} went missing.`); return; }
    const payload: Record<string, unknown> = { id: editing.id, body };
    if (editing.delay_minutes != null) payload.delay_minutes = delay === "" ? null : delay;
    const r = await save("template_update", payload);
    if (r.ok) setEditing(null); else setErr(r.error);
  }

  const segments = (s: string) => Math.max(1, Math.ceil(s.length / 160));

  return (
    <div className="space-y-4">
      <SaveStatus msg={msg} />
      <RowCard>
        {templates.length === 0 && <div className="px-4 py-6 text-center text-[13px] text-[color:var(--body)]">No templates in the database.</div>}
        {templates.map((t) => (
          <div key={t.id} className="flex items-center gap-3 pr-4">
            <Row onClick={() => open(t)} label={titleCase(t.name)} muted={!t.active} className="flex-1 pr-0"
              sub={<><span className="line-clamp-2">“{t.body}”</span>{delayLabel(t.delay_minutes) && <span className="mo-eyebrow mt-1 block text-[9px]">{delayLabel(t.delay_minutes)}</span>}</>} />
            <Switch on={t.active} label={`${titleCase(t.name)} on`} disabled={busy} onChange={(v) => save("template_update", { id: t.id, active: v })} />
          </div>
        ))}
      </RowCard>

      <p className="px-0.5 text-[13px] leading-relaxed text-[color:var(--body)]">
        Fields in braces are filled in when the text goes out. A template that is off is skipped, and the ones with a delay are the follow-up nudges after a lead comes in.
      </p>

      <Sheet open={Boolean(editing)} onClose={() => setEditing(null)} title={editing ? titleCase(editing.name) : ""}
        footer={<Button className="h-12 w-full text-[14px]" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save template"}</Button>}>
        {editing && (
          <div className="pt-1">
            <Field label="Message">
              <textarea className={`${INPUT} min-h-[140px] resize-y leading-relaxed`} value={body} onChange={(e) => setBody(e.target.value)} />
              <div className="mt-1.5 flex items-center justify-between">
                <span className="mo-eyebrow text-[9px]">{fields(editing.body).length ? `Fields: ${fields(editing.body).join(" ")}` : "No fields"}</span>
                <span className="mo-mono text-[11px] text-[color:var(--body)]">{body.length} chars · {segments(body)} segment{segments(body) === 1 ? "" : "s"}</span>
              </div>
            </Field>
            {editing.delay_minutes != null && (
              <Field label="Delay after the lead comes in · minutes">
                <input className={INPUT} inputMode="numeric" value={delay} onChange={(e) => setDelay(e.target.value)} />
              </Field>
            )}
            {err && <p className="mb-3 text-[13px] text-coral">{err}</p>}
          </div>
        )}
      </Sheet>
    </div>
  );
}
