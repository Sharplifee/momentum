"use client";

import { useState } from "react";
import { Sheet, Field, INPUT } from "@/components/crm/Sheet";
import { Button } from "@/components/ui";
import { Check, Group, Row, RowCard } from "@/components/crm/settings/ui";
import { useSettingsSave, SaveStatus } from "@/components/crm/settings/client";

type Quiet = { no_sends_before: string; no_sends_after: string };
type Hours = { start: string; end: string; tz?: string };
type Season = { start: string; end: string };
type Model = { model?: string; version?: number; display_name?: string };

/** "21:00" → "9 PM", "06:30" → "6:30 AM". */
function clock(hhmm: string | undefined): string {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return "—";
  const [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hr}:${String(m).padStart(2, "0")} ${ap}` : `${hr} ${ap}`;
}
/** "04-01" → "Apr 1". */
function monthDay(mmdd: string | undefined): string {
  if (!mmdd || !/^\d{2}-\d{2}$/.test(mmdd)) return "—";
  const [m, d] = mmdd.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${d}`;
}

/* These five are the escalate_to_human conditions in Norma's system prompt
   (lib/nora.ts, hard rule 5 and the service-area rule). Read-only here: the
   prompt is code, and a toggle that did nothing would be a lie. */
const HANDOFF = [
  "The customer asks for a person",
  "A complaint, damage, or refund comes up",
  "A discount is asked for, or the customer is angry",
  "She can't answer from what she knows",
  "She isn't sure the property is in the service area",
];

type Editing = "quiet" | "hours" | "season" | null;

export function NormaRulesSettings({ quiet, hours, season, model, blocker }: { quiet: Quiet | null; hours: Hours | null; season: Season | null; model: Model | null; blocker: string | null }) {
  const { save, busy, msg } = useSettingsSave();
  const [editing, setEditing] = useState<Editing>(null);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [err, setErr] = useState("");

  const open = (what: Exclude<Editing, null>) => {
    setErr("");
    if (what === "quiet") { setA(quiet?.no_sends_after ?? "21:00"); setB(quiet?.no_sends_before ?? "08:00"); }
    if (what === "hours") { setA(hours?.start ?? "08:00"); setB(hours?.end ?? "20:00"); }
    if (what === "season") { setA(season?.start ?? "04-01"); setB(season?.end ?? "11-15"); }
    setEditing(what);
  };

  async function submit() {
    if (!editing) return;
    const value = editing === "quiet" ? { no_sends_after: a, no_sends_before: b } : { start: a, end: b };
    const key = editing === "quiet" ? "quiet_hours" : editing === "hours" ? "business_hours" : "season";
    const r = await save("config_update", { key, value });
    if (r.ok) setEditing(null); else setErr(r.error);
  }

  const titles: Record<Exclude<Editing, null>, string> = { quiet: "Quiet hours", hours: "Business hours", season: "Season" };

  return (
    <div className="space-y-5">
      <SaveStatus msg={msg} />
      {blocker && (
        <div className="rounded-xl border border-coral/40 px-4 py-3 text-[13px] leading-snug text-coral">
          <span className="mo-eyebrow mb-1 block text-coral">Not replying</span>{blocker}
        </div>
      )}

      <RowCard>
        <Row onClick={() => open("quiet")} chevron label="Quiet hours"
          sub={quiet ? `No texts ${clock(quiet.no_sends_after)} – ${clock(quiet.no_sends_before)} · anything due then waits for morning` : "Not set · texts go out at any hour"} />
        <Row onClick={() => open("hours")} chevron label="Business hours"
          sub={hours ? `${clock(hours.start)} – ${clock(hours.end)} Mountain` : "Not set"} />
        <Row onClick={() => open("season")} chevron label="Season"
          sub={season ? `${monthDay(season.start)} – ${monthDay(season.end)} · off-season leads are noted for spring` : "Not set"} />
        <Row label="Replies to new leads" sub="Right away, inside quiet hours it waits · offers only days the schedule has open" />
        <Row label="Books the quote visit" sub="Confirms the day only · never a price · pricing is set in person" />
      </RowCard>

      <Group label="Hands off to a human when">
        <RowCard>
          {HANDOFF.map((h) => (
            <div key={h} className="flex items-center gap-3 px-4 py-3">
              <Check ok />
              <span className="text-[14px] text-[color:var(--ink)]">{h}</span>
            </div>
          ))}
        </RowCard>
        <p className="mt-2 px-0.5 text-[12px] leading-relaxed text-[color:var(--body)]">After a hand-off she tells the customer a team member will follow up, flags the thread, and texts the alert list.</p>
      </Group>

      <section className="mo-card p-4">
        <div className="mo-eyebrow mb-2">Voice</div>
        <p className="text-[14px] leading-relaxed text-[color:var(--ink)]">Friendly, brief, Utah-neighborly. First names. One question per message. Says she is Momentum&rsquo;s AI assistant if anyone asks, and never claims to be a person.</p>
      </section>

      <section className="mo-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="mo-eyebrow">Model</span>
          <span className="mo-eyebrow text-[9px] text-[color:var(--faint)]">Changed in code</span>
        </div>
        <p className="mo-mono text-[13px] text-[color:var(--ink)]">{model?.model ?? "—"}{model?.version != null ? <span className="text-[color:var(--body)]"> · prompt v{model.version}</span> : null}</p>
      </section>

      <Sheet open={Boolean(editing)} onClose={() => setEditing(null)} title={editing ? titles[editing] : ""}
        footer={<Button className="h-12 w-full text-[14px]" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>}>
        {editing && (
          <div className="pt-1">
            <div className="grid grid-cols-2 gap-3">
              <Field label={editing === "quiet" ? "No texts after" : editing === "hours" ? "Open from" : "Starts · MM-DD"}>
                <input className={INPUT} type={editing === "season" ? "text" : "time"} value={a} onChange={(e) => setA(e.target.value)} placeholder={editing === "season" ? "04-01" : undefined} />
              </Field>
              <Field label={editing === "quiet" ? "Texts resume at" : editing === "hours" ? "Until" : "Ends · MM-DD"}>
                <input className={INPUT} type={editing === "season" ? "text" : "time"} value={b} onChange={(e) => setB(e.target.value)} placeholder={editing === "season" ? "11-15" : undefined} />
              </Field>
            </div>
            <p className="mb-3 text-[12px] text-[color:var(--body)]">
              {editing === "quiet" && "Customer texts due in this window are queued and sent the next morning. Team alerts still come through."}
              {editing === "hours" && "Mountain time. Shown to customers as when the team is reachable."}
              {editing === "season" && "Outside the season Norma takes the lead's details and says the team will reach out at season start."}
            </p>
            {err && <p className="mb-3 text-[13px] text-coral">{err}</p>}
          </div>
        )}
      </Sheet>
    </div>
  );
}
