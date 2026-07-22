"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function MoneyActions({ invoice }: { invoice: { id: string; status: string; phone: string | null } }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    const res = await fetch("/api/crm/money", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, invoice_id: invoice.id, ...extra }) });
    const json = await res.json().catch(() => ({}));
    setMsg(res.ok ? (json.message ?? "Done.") : (json.error ?? "Failed"));
    setBusy("");
    router.refresh();
  }

  if (invoice.status === "paid" || invoice.status === "void") return msg ? <p className="mt-2 text-xs text-stone-400">{msg}</p> : null;

  return (
    <div className="mt-2 flex flex-wrap gap-2 text-xs">
      <button disabled={!!busy} onClick={() => act("send")} className="rounded-lg bg-moss px-3 py-1.5 font-semibold text-white">Send w/ pay link</button>
      <button disabled={!!busy} onClick={() => { const method = prompt("Method (cash/check/venmo)?", "cash"); if (method) act("mark_paid", { method, note: prompt("Note (optional)") ?? "" }); }}
        className="rounded-lg bg-stone-200 px-3 py-1.5 dark:bg-stone-700">Mark paid</button>
      <button disabled={!!busy} onClick={() => { const reason = prompt("Void reason?"); if (reason) act("void", { reason }); }}
        className="rounded-lg bg-red-100 px-3 py-1.5 text-red-700 dark:bg-red-950">Void</button>
      {msg && <span className="self-center text-stone-400">{msg}</span>}
    </div>
  );
}
