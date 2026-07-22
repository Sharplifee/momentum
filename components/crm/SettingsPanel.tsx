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
      {msg && <p className="text-sm text-stone-500">{msg}</p>}
      <section className="rounded-xl bg-white p-4 shadow-sm dark:bg-stone-900">
        <h2 className="mb-2 font-semibold">Services & prices</h2>
        {services.map((s: any) => (
          <div key={s.id} className="flex items-center gap-2 border-b border-stone-100 py-2 text-sm last:border-0 dark:border-stone-800">
            <span className="flex-1">{s.name} <span className="text-stone-400">({s.slug})</span></span>
            <input type="number" step="0.01" defaultValue={s.base_price ?? ""} placeholder="quoted"
              onBlur={(e) => e.target.value !== String(s.base_price ?? "") && save("service_price", { id: s.id, base_price: e.target.value ? Number(e.target.value) : null })}
              className="w-24 rounded border border-stone-300 p-1 dark:border-stone-700 dark:bg-stone-800" />
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" defaultChecked={s.active} onChange={(e) => save("service_active", { id: s.id, active: e.target.checked })} /> active</label>
          </div>
        ))}
      </section>

      <section className="rounded-xl bg-white p-4 shadow-sm dark:bg-stone-900">
        <h2 className="mb-2 font-semibold">SMS sandbox <span className="text-xs text-amber-600">(disable ONLY with Connor's explicit go)</span></h2>
        <p className="text-sm">{sandboxCfg?.enabled ? `🟡 ON — everything redirects to ${sandboxCfg.redirect_all_to}` : "🟢 OFF — live sends"}</p>
      </section>

      <section className="rounded-xl bg-white p-4 shadow-sm dark:bg-stone-900">
        <h2 className="mb-2 font-semibold">Team alerts</h2>
        <p className="mb-2 text-sm">Mode: <strong>{alertsCfg?.mode}</strong> · testing → {JSON.stringify(alertsCfg?.recipients)} · launch → {JSON.stringify(alertsCfg?.launch_recipients)}</p>
        <button disabled={busy === "alerts"} onClick={() => save("alerts_mode", { mode: alertsCfg?.mode === "testing" ? "launch" : "testing" })}
          className="rounded-lg bg-stone-200 px-3 py-1 text-sm dark:bg-stone-700">Switch to {alertsCfg?.mode === "testing" ? "launch" : "testing"}</button>
      </section>

      <section className="rounded-xl bg-white p-4 shadow-sm dark:bg-stone-900">
        <h2 className="mb-2 font-semibold">Wayne</h2>
        <p className="text-sm">Model: <strong>{wayneCfg?.model}</strong> · prompt version {wayneCfg?.version}</p>
      </section>

      <section className="rounded-xl bg-white p-4 shadow-sm dark:bg-stone-900">
        <h2 className="mb-2 font-semibold">SMS templates</h2>
        {templates.map((t: any) => (
          <details key={t.id} className="border-b border-stone-100 py-2 text-sm last:border-0 dark:border-stone-800">
            <summary>{t.name}{t.delay_minutes != null ? ` (+${t.delay_minutes}m)` : ""}{!t.active && " · inactive"}</summary>
            <textarea defaultValue={t.body} rows={3} className="mt-2 w-full rounded border border-stone-300 p-2 text-xs dark:border-stone-700 dark:bg-stone-800"
              onBlur={(e) => e.target.value !== t.body && save("template", { id: t.id, body: e.target.value })} />
          </details>
        ))}
      </section>

      <section className="rounded-xl bg-white p-4 shadow-sm dark:bg-stone-900">
        <h2 className="mb-2 font-semibold">Zones & crews</h2>
        {zones.map((z: any) => <div key={z.id} className="text-sm">{z.name} — {(z.cities ?? []).join(", ")}</div>)}
        <div className="mt-2 text-sm text-stone-500">{crews.map((c: any) => `${c.name} (zone ${c.home_zone}, max ${c.max_daily_jobs}/day)`).join(" · ")}</div>
      </section>
    </div>
  );
}
