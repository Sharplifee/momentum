"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet, Field, Segmented, INPUT } from "./Sheet";

import { EXPENSE_CATEGORIES, MORE_EXPENSE_CATEGORIES as MORE } from "@/lib/expenseCategories";

type Job = { id: string; label: string };

/**
 * "+ Expense" — a bottom sheet. Receipt photo first (it's the thing people
 * forget), then amount, date, vendor, category, and an optional job to tie
 * it to. Posts to the existing expenses route as form data.
 */
export function ExpenseButton({ jobs, openInitially = false }: { jobs: Job[]; openInitially?: boolean }) {
  const [open, setOpen] = useState(openInitially);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mo-primary rounded-full px-4 py-2 text-[13px] font-semibold">+ Expense</button>
      <ExpenseSheet jobs={jobs} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function ExpenseSheet({ jobs, open, onClose }: { jobs: Job[]; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState("fuel");
  const [jobId, setJobId] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSave = Number(amount) > 0 && Boolean(date) && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true); setErr(null);
    const form = new FormData();
    form.set("category", category);
    form.set("amount", String(Number(amount)));
    form.set("vendor", vendor.trim());
    form.set("expense_date", date);
    form.set("job_id", jobId);
    if (receipt) form.set("receipt", receipt);
    const res = await fetch("/api/crm/expenses", { method: "POST", body: form });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(j.error ?? "Couldn't save — try again."); return; }
    setAmount(""); setVendor(""); setJobId(""); setReceipt(null); setCategory("fuel"); setDate(today);
    onClose();
    router.replace("/crm/expenses");
    router.refresh();
  }

  return (
    <Sheet open={open} onClose={onClose} title="New expense"
      footer={
        <>
          {err && <div className="mb-2 text-center text-[12px] text-coral">{err}</div>}
          <button type="button" onClick={save} disabled={!canSave} className="mo-primary w-full rounded-full py-3.5 text-[15px] font-semibold disabled:opacity-40">{busy ? "Saving…" : "Save"}</button>
        </>
      }>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} />
      <button type="button" onClick={() => fileRef.current?.click()}
        className={`mb-4 flex h-[150px] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed ${receipt ? "border-sage/60" : "border-teal/50"} bg-black/20`}>
        <svg viewBox="0 0 24 24" className="h-7 w-7 text-[color:var(--ink)]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.5" /></svg>
        <span className="text-[14px] font-semibold text-[color:var(--ink)]">{receipt ? receipt.name : "Snap the receipt"}</span>
        <span className="mo-eyebrow text-[9px]">{receipt ? "Attached · tap to change" : "Photo stays with the expense"}</span>
      </button>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-[color:var(--body)]">$</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${INPUT} pl-8`} autoFocus />
          </div>
        </Field>
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} /></Field>
      </div>
      <Field label="Vendor"><input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Maverik · 12600 S Riverton" className={INPUT} /></Field>
      <Field label="Category">
        <Segmented options={EXPENSE_CATEGORIES} value={category} onChange={setCategory} />
        <select value={MORE.includes(category) ? category : ""} onChange={(e) => e.target.value && setCategory(e.target.value)} className={`${INPUT} mt-2 text-[13px]`}>
          <option value="">More categories…</option>
          {MORE.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
        </select>
      </Field>
      <Field label="Tie to a job · optional">
        <select value={jobId} onChange={(e) => setJobId(e.target.value)} className={INPUT}>
          <option value="">No job</option>
          {jobs.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}
        </select>
      </Field>
    </Sheet>
  );
}
