"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CATEGORIES = ["fuel", "equipment", "materials", "labor", "insurance", "software", "marketing", "other"];

export function ExpenseForm({ jobs }: { jobs: { id: string; label: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/crm/expenses", { method: "POST", body: form });
    setMsg(res.ok ? "Expense saved." : "Save failed.");
    setBusy(false);
    if (res.ok) (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-3 mo-card p-4 sm:grid-cols-2 lg:grid-cols-3 ">
      <select name="category" required className="rounded-lg border border-[color:var(--border)] p-2 text-sm dark:border-[color:var(--border)] dark:bg-white/10">
        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <input name="amount" type="number" step="0.01" min="0.01" required placeholder="Amount" className="rounded-lg border border-[color:var(--border)] p-2 text-sm dark:border-[color:var(--border)] dark:bg-white/10" />
      <input name="vendor" placeholder="Vendor" className="rounded-lg border border-[color:var(--border)] p-2 text-sm dark:border-[color:var(--border)] dark:bg-white/10" />
      <input name="expense_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="rounded-lg border border-[color:var(--border)] p-2 text-sm dark:border-[color:var(--border)] dark:bg-white/10" />
      <select name="job_id" className="rounded-lg border border-[color:var(--border)] p-2 text-sm dark:border-[color:var(--border)] dark:bg-white/10">
        <option value="">No job link</option>
        {jobs.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}
      </select>
      <input name="receipt" type="file" accept="image/*" className="text-sm" />
      <button disabled={busy} className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2 lg:col-span-1">{busy ? "Saving…" : "Add expense"}</button>
      {msg && <p className="text-xs text-slate/70 sm:col-span-2">{msg}</p>}
    </form>
  );
}
