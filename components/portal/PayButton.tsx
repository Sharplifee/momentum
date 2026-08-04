"use client";

import { useState } from "react";

/**
 * Starts Stripe checkout for one invoice. The route already authorizes the
 * caller against the invoice's customer, so this only has to hand over the id
 * and follow the URL it gets back. In pending mode (no STRIPE_SECRET_KEY) the
 * route returns a placeholder URL back to /portal/billing, so the button is
 * safe to ship before the live key is set.
 */
export function PayButton({ invoiceId, amount }: { invoiceId: string; amount: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: invoiceId }),
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || !json?.url) {
        setError(json?.error ?? "Couldn't open checkout — try again or message us.");
        setBusy(false);
        return;
      }
      window.location.href = json.url;
    } catch {
      setError("Network hiccup — try again.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="w-full rounded-xl bg-teal px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Opening secure checkout…" : `Pay $${amount.toFixed(2)}`}
      </button>
      {error && <p className="mt-1 text-xs text-amber-300">{error}</p>}
    </div>
  );
}
