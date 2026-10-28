"use client";

import { useState } from "react";

export function FlowTester() {
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setResult(null);
    const res = await fetch("/api/crm/test", { method: "POST" });
    setResult(await res.json());
    setBusy(false);
  }

  return (
    <div>
      <button onClick={run} disabled={busy} className="mb-4 rounded-lg bg-teal px-6 py-3 font-semibold text-white disabled:opacity-50">
        {busy ? "Running…" : "Run full pipeline test"}
      </button>
      {result && (
        <div className="space-y-2">
          <div className={`rounded-xl p-4 font-semibold ${result.ok ? "border border-gold/50 text-gold" : "bg-red/10 text-red"}`}>
            {result.ok ? "✓ ALL STEPS PASS" : "✗ FAILURES DETECTED"}
          </div>
          {(result.steps ?? []).map((s: any, i: number) => (
            <div key={i} className="flex items-start justify-between mo-card rounded-lg p-3 text-sm ">
              <span>{s.pass ? "✅" : "❌"} <strong>{s.step}</strong></span>
              <span className="max-w-md truncate text-xs text-slate/70">{JSON.stringify(s.detail ?? "")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
