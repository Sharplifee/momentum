"use client";

import { useState } from "react";

export function PreferencesForm({ initial }: { initial: { reminder_opt_out: boolean; marketing_opt_out: boolean; sms_opt_out: boolean } }) {
  const [prefs, setPrefs] = useState(initial);
  const [msg, setMsg] = useState("");

  async function toggle(key: keyof typeof prefs) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    const res = await fetch("/api/portal/preferences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: next[key] }) });
    setMsg(res.ok ? "Saved." : "Save failed.");
  }

  const rows: { key: keyof typeof prefs; label: string; desc: string }[] = [
    { key: "reminder_opt_out", label: "Visit reminders", desc: "Day-before texts about scheduled visits" },
    { key: "marketing_opt_out", label: "Offers & seasonal tips", desc: "Occasional service offers" },
    { key: "sms_opt_out", label: "All texts", desc: "Master switch — turns off every text (you can still use this portal)" },
  ];

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center justify-between rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
          <div>
            <p className="font-semibold">{r.label}</p>
            <p className="text-xs text-white/50">{r.desc}</p>
          </div>
          <button onClick={() => toggle(r.key)}
            className={`h-7 w-12 rounded-full p-1 transition ${prefs[r.key] ? "bg-white/20" : "bg-teal"}`}
            aria-label={`${r.label}: ${prefs[r.key] ? "off" : "on"}`}>
            <span className={`block h-5 w-5 rounded-full bg-white transition ${prefs[r.key] ? "" : "translate-x-5"}`} />
          </button>
        </div>
      ))}
      {msg && <p className="text-xs text-white/50">{msg}</p>}
    </div>
  );
}
