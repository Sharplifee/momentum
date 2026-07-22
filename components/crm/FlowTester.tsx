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
      <button onClick={run} disabled={busy} className="mb-4 rounded-lg bg-moss px-6 py-3 font-semibold text-white disabled:opacity-50">
        {busy ? "Running…" : "Run full pipeline test"}
      </button>
      {result && (
        <div className="space-y-2">
          <div className={`rounded-xl p-4 font-semibold ${result.ok ? "bg-green-50 text-green-800 dark:bg-green-950" : "bg-red-50 text-red-800 dark:bg-red-950"}`}>
            {result.ok ? "✓ ALL STEPS PASS" : "✗ FAILURES DETECTED"}
          </div>
          {(result.steps ?? []).map((s: any, i: number) => (
            <div key={i} className="flex items-start justify-between rounded-lg bg-white p-3 text-sm shadow-sm dark:bg-stone-900">
              <span>{s.pass ? "✅" : "❌"} <strong>{s.step}</strong></span>
              <span className="max-w-md truncate text-xs text-stone-400">{JSON.stringify(s.detail ?? "")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
