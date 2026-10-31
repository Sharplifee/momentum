"use client";

import { useEffect, useState } from "react";
import { Segmented } from "@/components/crm/Sheet";
import { Avatar, Check, Group, Row, RowCard, maskPhone, Tag } from "@/components/crm/settings/ui";
import { Switch, useSettingsSave, SaveStatus } from "@/components/crm/settings/client";

type Staff = { id: string; full_name: string | null; role: string; phone: string | null };
type Mode = "testing" | "launch" | "live";

/* What the code actually sends to the list today — lib/nora.ts and app/api/leads/route.ts. */
const EVENTS = [
  { label: "New lead", sub: "Name, address, phone and where it came from" },
  { label: "Norma booked a visit", sub: "Who, which service, which day" },
  { label: "Norma needs a human", sub: "The thread is flagged and the reason is in the text" },
];

function clock(hhmm: string | undefined): string {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return "—";
  const [h, m] = hhmm.split(":").map(Number);
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h >= 12 ? "PM" : "AM"}`;
}

export function TeamAlertsSettings({ mode, recipients, launchRecipients, staff, quiet }: {
  mode: string; recipients: string[]; launchRecipients: string[]; staff: Staff[]; quiet: { no_sends_before: string; no_sends_after: string } | null;
}) {
  const { save, busy, msg } = useSettingsSave();
  const activeList = mode === "launch" ? launchRecipients : recipients;
  const [list, setList] = useState<string[]>(activeList);
  // Props change after a save (router.refresh) or a mode switch — follow them.
  const key = activeList.join("|");
  useEffect(() => { setList(key ? key.split("|") : []); }, [key]);

  const withPhone = staff.filter((s) => s.phone);
  const noPhone = staff.filter((s) => !s.phone);
  // Numbers on the list that match nobody on staff — shown so nothing is hidden.
  const unknown = list.filter((p) => !staff.some((s) => s.phone === p));

  async function toggle(phone: string, on: boolean) {
    const next = on ? Array.from(new Set([...list, phone])) : list.filter((p) => p !== phone);
    setList(next);
    const r = await save("alerts_recipients", { phones: next });
    if (!r.ok) setList(list);
  }

  const modeValue: Mode = mode === "launch" ? "launch" : mode === "live" ? "live" : "testing";

  return (
    <div className="space-y-5">
      <SaveStatus msg={msg} />

      <Group label="Who gets the text">
        <RowCard>
          {withPhone.map((s) => {
            const on = list.includes(s.phone!);
            return (
              <div key={s.id} className="flex items-center gap-3 pr-4">
                <Row lead={<Avatar name={s.full_name ?? "?"} size={36} />} label={s.full_name ?? s.phone}
                  sub={<span className="mo-mono">{maskPhone(s.phone)} · {s.role}</span>} className="flex-1 pr-0" />
                <Switch on={on} label={`Alert ${s.full_name ?? s.phone}`} disabled={busy} onChange={(v) => toggle(s.phone!, v)} />
              </div>
            );
          })}
          {noPhone.map((s) => (
            <Row key={s.id} lead={<Avatar name={s.full_name ?? "?"} size={36} />} label={s.full_name ?? "—"} sub="No phone on their account yet" muted trail={<Tag tone="faint">No number</Tag>} />
          ))}
          {unknown.map((p) => (
            <div key={p} className="flex items-center gap-3 pr-4">
              <Row lead={<span className="mo-mono grid h-9 w-9 place-items-center rounded-full border border-[color:var(--border)] text-[11px]">?</span>} label={<span className="mo-mono">{maskPhone(p)}</span>} sub="Not matched to anyone on staff" className="flex-1 pr-0" />
              <Switch on label={`Alert ${p}`} disabled={busy} onChange={(v) => toggle(p, v)} />
            </div>
          ))}
          {staff.length === 0 && <div className="px-4 py-6 text-center text-[13px] text-[color:var(--body)]">No staff accounts.</div>}
        </RowCard>
        <p className="mt-2 px-0.5 text-[12px] leading-relaxed text-[color:var(--body)]">
          {list.length === 0 ? "Nobody is on the list — alerts have nowhere to go." : `${list.length} number${list.length === 1 ? "" : "s"} on the list. Alerts go by SMS and skip quiet hours${quiet ? ` (${clock(quiet.no_sends_after)} – ${clock(quiet.no_sends_before)})` : ""}.`}
        </p>
      </Group>

      <Group label="What gets sent">
        <RowCard>
          {EVENTS.map((e) => (
            <div key={e.label} className="flex items-center gap-3 px-4 py-3">
              <Check ok />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] text-[color:var(--ink)]">{e.label}</span>
                <span className="block text-[12px] text-[color:var(--body)]">{e.sub}</span>
              </span>
              <Tag tone="sage">Everyone</Tag>
            </div>
          ))}
        </RowCard>
      </Group>

      <section className="mo-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="mo-eyebrow">Mode</span>
          <span className="mo-eyebrow text-[9px] text-[color:var(--faint)]">{modeValue === "launch" ? "uses the launch list" : "uses the main list"}</span>
        </div>
        <Segmented<Mode> options={[{ value: "testing", label: "Testing" }, { value: "launch", label: "Launch" }, { value: "live", label: "Live" }]} value={modeValue}
          onChange={(m) => { if (m !== modeValue && !busy) void save("alerts_mode", { mode: m }); }} />
        <p className="mt-2 text-[12px] leading-relaxed text-[color:var(--body)]">Launch reads its own list of numbers; testing and live both read the main list. The toggles above edit whichever list the current mode uses.</p>
      </section>
    </div>
  );
}
