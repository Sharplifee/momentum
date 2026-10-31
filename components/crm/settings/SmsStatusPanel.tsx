"use client";

import { useEffect, useState } from "react";
import { Check, Dot, Group, Row, RowCard, type Tone } from "@/components/crm/settings/ui";

type Health = { ok: boolean; detail?: string } | null;

const TZ = "America/Denver";
const when = (iso: string | null) => iso
  ? new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso))
  : "—";
function clock(hhmm: string | undefined): string {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return "—";
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h >= 12 ? "PM" : "AM"}`;
}

export function SmsStatusPanel({ provider, sandbox, sandboxUpdated, quiet, counts, lastInbound, lastOutbound, optOuts, checklist }: {
  provider: string;
  sandbox: { enabled?: boolean; redirect_all_to?: string; dry_run_default?: boolean } | null;
  sandboxUpdated: string | null;
  quiet: { no_sends_before: string; no_sends_after: string } | null;
  counts: { sent: number; delivered: number; failed: number };
  lastInbound: string | null; lastOutbound: string | null; optOuts: number;
  checklist: { id?: string; label: string; done: boolean }[];
}) {
  const [health, setHealth] = useState<Health | "loading" | "error">("loading");

  useEffect(() => {
    let alive = true;
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (alive) setHealth((j?.checks?.pingram as Health) ?? null); })
      .catch(() => { if (alive) setHealth("error"); });
    return () => { alive = false; };
  }, []);

  // The headline: sandbox beats everything, then the provider's live answer.
  let tone: Tone = "faint"; let title = "Checking the provider…"; let sub: string = `Asking ${provider} whether sends are going through.`;
  if (sandbox?.enabled) {
    tone = "gold"; title = "Sandbox · customers do not receive texts";
    sub = sandbox.redirect_all_to ? `Everything redirects to ${sandbox.redirect_all_to}` : "Test traffic only";
  } else if (health === "error") {
    tone = "coral"; title = "Could not reach the health check"; sub = "Open /api/health directly, or try again in a minute.";
  } else if (health !== "loading") {
    if (!health) { tone = "coral"; title = "Provider check missing"; sub = "/api/health returned no SMS result."; }
    else if (health.ok) { tone = "sage"; title = `Live on ${provider}`; sub = health.detail ?? "Sends are going through."; }
    else { tone = "coral"; title = "Sending is blocked"; sub = health.detail ?? "The provider rejected the account check."; }
  }

  return (
    <div className="space-y-5">
      <section className="mo-card aiv-glow flex items-start gap-3.5 p-4">
        <Dot tone={tone} className="mt-[7px] h-2.5 w-2.5" />
        <div className="min-w-0">
          <h2 className="font-display text-[17px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">{title}</h2>
          <p className="mt-1 text-[13px] leading-snug text-[color:var(--body)]">{sub}</p>
          {sandbox?.enabled && sandboxUpdated && <p className="mo-eyebrow mt-2 text-[9px]">Sandbox set {when(sandboxUpdated)} · turned off only on Connor&rsquo;s word</p>}
        </div>
      </section>

      <Group label="Today · Mountain time">
        <div className="grid grid-cols-3 gap-2">
          {[{ l: "Sent", v: counts.sent }, { l: "Delivered", v: counts.delivered }, { l: "Failed", v: counts.failed, bad: counts.failed > 0 }].map((t) => (
            <div key={t.l} className="mo-card flex flex-col gap-2 p-3.5">
              <span className="mo-eyebrow whitespace-nowrap">{t.l}</span>
              <span className={`mo-num text-[26px] font-semibold leading-none ${t.bad ? "text-coral" : "text-[color:var(--ink)]"}`}>{t.v}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 px-0.5 text-[12px] leading-relaxed text-[color:var(--body)]">Delivered counts only what the provider reported back, so it can trail Sent.</p>
      </Group>

      <RowCard>
        <Row label="Last text in" sub="A customer reply or STOP" trail={<span className="mo-mono text-[12px] text-[color:var(--body)]">{when(lastInbound)}</span>} />
        <Row label="Last text out" sub="Norma or a team alert" trail={<span className="mo-mono text-[12px] text-[color:var(--body)]">{when(lastOutbound)}</span>} />
        <Row label="Quiet hours" sub={quiet ? "Customer texts due in this window wait for morning" : "Not set"} trail={<span className="mo-mono text-[12px] text-[color:var(--body)]">{quiet ? `${clock(quiet.no_sends_after)} – ${clock(quiet.no_sends_before)}` : "—"}</span>} />
        <Row label="Opted out" sub="Customers who replied STOP · never texted again" trail={<span className="mo-mono text-[12px] text-[color:var(--body)]">{optOuts}</span>} />
      </RowCard>

      {checklist.length > 0 && (
        <Group label="From the launch checklist">
          <RowCard>
            {checklist.map((c) => (
              <div key={c.id ?? c.label} className="flex items-start gap-3 px-4 py-3">
                <Check ok={c.done} />
                <span className={`text-[13px] leading-snug ${c.done ? "text-[color:var(--body)]" : "text-[color:var(--ink)]"}`}>{c.label}</span>
              </div>
            ))}
          </RowCard>
        </Group>
      )}
    </div>
  );
}
