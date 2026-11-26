"use client";

import Link from "next/link";
import { BookVisitButton } from "@/components/crm/BookVisitSheet";

export function LeadRowActions({ lead }: {
  lead: { id: string; phone: string | null; zone_id: number | null; requested_days?: string[] | null; requested_window?: string | null };
}) {
  const tel = lead.phone ? `tel:${lead.phone}` : null;
  return (
    <div className="flex items-center gap-1.5">
      {lead.phone ? (
        <>
          <Link href={`/crm/messages?new=${encodeURIComponent(lead.phone ?? "")}&lead=${lead.id}`}
            className="rounded-full border border-[color:var(--border-strong)] px-2.5 py-1.5 text-[12px] font-semibold text-[color:var(--ink)]">
            Text
          </Link>
          <a href={tel!} className="rounded-full border border-[color:var(--border-strong)] px-2.5 py-1.5 text-[12px] font-semibold text-[color:var(--ink)]">
            Call
          </a>
        </>
      ) : (
        <span className="rounded-full border border-[color:var(--border)] px-2.5 py-1.5 text-[12px] text-[color:var(--faint)]">No phone</span>
      )}
      <BookVisitButton leadId={lead.id} zoneId={lead.zone_id} requestedDays={lead.requested_days as any} requestedWindow={lead.requested_window as any} />
    </div>
  );
}
