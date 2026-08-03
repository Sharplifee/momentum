"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";

type Suggestion = {
  id: number;
  property_id: string;
  original: string;
  original_city: string | null;
  suggested: string;
  suggested_city: string | null;
  confidence: number;
  reason: string;
};

/**
 * Addresses that could not be matched to a parcel, with what the resolver
 * thinks they are probably meant to be.
 *
 * A property with no parcel can never be GPS-verified, so these are worth
 * clearing. Nothing is applied without a decision here — the resolver only
 * writes an address on its own when the correction is unmistakable.
 */
export function AddressSuggestions({ groups }: { groups: Record<string, Suggestion[]> }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState("");

  const entries = Object.entries(groups);
  if (!entries.length) return null;

  async function decide(s: Suggestion, accept: boolean) {
    setBusy(s.id); setErr("");
    const res = await fetch("/api/crm/address-suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, accept }),
    });
    if (!res.ok) setErr((await res.json().catch(() => ({}))).error ?? "Couldn't save that");
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="mb-6">
      <div className="mb-1 font-display text-[20px] text-[color:var(--ink)]">Check an address</div>
      <p className="mb-3 text-sm text-[color:var(--body)]">
        These couldn&apos;t be matched to a parcel, so they can&apos;t be verified on site. Here&apos;s what each one
        is probably meant to be.
      </p>
      {err && <div className="mb-3 text-sm text-red">{err}</div>}

      <div className="space-y-3">
        {entries.map(([propertyId, list]) => {
          const top = list[0];
          return (
            <Card key={propertyId} className="p-4">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-[color:var(--body)]">On file</div>
              <div className="mb-3 text-sm font-medium text-[color:var(--ink)]">
                {top.original}{top.original_city ? `, ${top.original_city}` : ""}
              </div>

              {list.map((s, i) => (
                <div key={s.id}
                  className={`rounded-xl border p-3 ${i === 0 ? "border-accent/35 bg-accent/[0.06]" : "mt-2 border-[color:var(--border)]"}`}>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <span className="text-[11px] uppercase tracking-wide text-[color:var(--body)]">
                      {i === 0 ? "Best guess" : "Also possible"}
                    </span>
                    <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-semibold text-[#c4b9ff]">
                      {s.confidence}%
                    </span>
                  </div>
                  <div className="text-sm font-medium text-[color:var(--ink)]">
                    {s.suggested}{s.suggested_city ? `, ${s.suggested_city}` : ""}
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-[color:var(--body)]">{s.reason}</div>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => decide(s, true)} disabled={busy === s.id}
                      className="flex-1 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50">
                      {busy === s.id ? "…" : "Use this"}
                    </button>
                    <button onClick={() => decide(s, false)} disabled={busy === s.id}
                      className="flex-1 rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-medium text-[color:var(--body)] transition hover:text-[color:var(--ink)] disabled:opacity-50">
                      Not it
                    </button>
                  </div>
                </div>
              ))}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
