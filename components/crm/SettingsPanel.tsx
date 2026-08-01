"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SettingsPanel({ services, zones, config, templates, crews }: any) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  async function save(kind: string, payload: unknown) {
    setBusy(kind);
    const res = await fetch("/api/crm/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, payload }) });
    setMsg(res.ok ? "Saved." : "Save failed.");
    setBusy("");
    router.refresh();
  }

  const sandboxCfg = config.find((c: any) => c.key === "sms_sandbox")?.value;
  const alertsCfg = config.find((c: any) => c.key === "team_alerts")?.value;
  const wayneCfg = config.find((c: any) => c.key === "wayne")?.value;

  return (
    <div className="space-y-6">
      {msg && <p className="text-sm text-slate">{msg}</p>}
      <section className="mo-card p-4">
        <h2 className="mb-2 font-semibold">Services</h2>
        <p className="mb-2 text-xs text-[color:var(--body)]">No listed pricing — every job is quoted per client at the visit.</p>
        {services.map((s: any) => (
          <div key={s.id} className="flex items-center gap-2 border-b border-[color:var(--border)] py-2 text-sm last:border-0">
            <span className="flex-1">{s.name} <span className="text-slate/70">({s.slug})</span></span>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" defaultChecked={s.active} onChange={(e) => save("service_active", { id: s.id, active: e.target.checked })} /> active</label>
          </div>
        ))}
      </section>

      <section className="mo-card p-4">
        <h2 className="mb-2 font-semibold">SMS sandbox <span className="text-xs text-[oklch(0.55_0.10_70)] dark:text-gold">(disable ONLY with Connor's explicit go)</span></h2>
        <p className="text-sm">{sandboxCfg?.enabled ? `🟡 ON — everything redirects to ${sandboxCfg.redirect_all_to}` : "🟢 OFF — live sends"}</p>
      </section>

      <section className="mo-card p-4">
        <h2 className="mb-2 font-semibold">Team alerts</h2>
        <p className="mb-2 text-sm">Mode: <strong>{alertsCfg?.mode}</strong> · testing → {JSON.stringify(alertsCfg?.recipients)} · launch → {JSON.stringify(alertsCfg?.launch_recipients)}</p>
        <button disabled={busy === "alerts"} onClick={() => save("alerts_mode", { mode: alertsCfg?.mode === "testing" ? "launch" : "testing" })}
          className="rounded-lg bg-ice/20 px-3 py-1 text-sm dark:bg-white/10">Switch to {alertsCfg?.mode === "testing" ? "launch" : "testing"}</button>
      </section>

      <section className="mo-card p-4">
        <h2 className="mb-2 font-semibold">Wayne</h2>
        <p className="text-sm">Model: <strong>{wayneCfg?.model}</strong> · prompt version {wayneCfg?.version}</p>
      </section>

      <section className="mo-card p-4">
        <h2 className="mb-2 font-semibold">SMS templates</h2>
        {templates.map((t: any) => (
          <details key={t.id} className="border-b border-[color:var(--border)] py-2 text-sm last:border-0">
            <summary>{t.name}{t.delay_minutes != null ? ` (+${t.delay_minutes}m)` : ""}{!t.active && " · inactive"}</summary>
            <textarea defaultValue={t.body} rows={3} className="mt-2 w-full rounded border border-[color:var(--border)] p-2 text-xs dark:border-[color:var(--border)] dark:bg-white/10"
              onBlur={(e) => e.target.value !== t.body && save("template", { id: t.id, body: e.target.value })} />
          </details>
        ))}
      </section>

      <section className="mo-card p-4">
        <h2 className="mb-2 font-semibold">Zones & crews</h2>
        {zones.map((z: any) => <div key={z.id} className="text-sm">{z.name} — {(z.cities ?? []).join(", ")}</div>)}
        <div className="mt-2 text-sm text-slate">{crews.map((c: any) => `${c.name} (zone ${c.home_zone}, max ${c.max_daily_jobs}/day)`).join(" · ")}</div>
      </section>
    </div>
  );
}
