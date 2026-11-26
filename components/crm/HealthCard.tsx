import { supabaseServer } from "@/lib/supabase/server";

export async function HealthCard() {
  const db = supabaseServer();
  const { data: rows } = await db.from("system_status").select("key, ok, detail, checked_at");
  const by: Record<string, any> = {};
  for (const r of rows ?? []) by[r.key] = r;
  const checkedAt = rows?.[0]?.checked_at ? new Date(rows[0].checked_at) : null;
  const ageMin = checkedAt ? Math.floor((Date.now() - checkedAt.getTime()) / 60000) : null;

  const sms = by["sms"]; const norma = by["norma"]; const gps = by["gps"]; const data = by["data"];
  const Row = ({ k, ok, hint, fix }: { k: string; ok: boolean; hint: string; fix: string }) => (
    <div className="flex items-center justify-between gap-2 border-t border-[color:var(--border)] py-2.5 first:border-t-0">
      <div className="min-w-0">
        <div className="text-[14px] font-medium text-[color:var(--ink)]">{k}</div>
        <div className="text-[12.5px] text-[color:var(--body)]">{hint}</div>
      </div>
      <a href={fix} className={`mo-eyebrow shrink-0 rounded-full border px-2 py-0.5 ${ok ? "border-sage/60 text-sage" : "border-gold/60 text-gold"}`}>{ok ? "OK" : "Fix"}</a>
    </div>
  );
  return (
    <div className="mo-card p-0">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <div className="font-display text-[15px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">System health</div>
          <div className="text-[11.5px] text-[color:var(--body)]">{ageMin != null ? `checked ${ageMin} min ago` : "no cache yet"}</div>
        </div>
      </div>
      <Row
        k="SMS"
        ok={Boolean(sms?.ok)}
        hint={sms?.detail?.cap ? `Spend ${sms.detail.spend ?? 0}/${sms.detail.cap} (sandbox)` : (sms?.ok ? "Provider reachable" : "Cap reached")}
        fix="/crm/settings/sms"
      />
      <Row
        k="Norma"
        ok={Boolean(norma?.ok)}
        hint={norma?.detail?.last_seen ? `Last reply ${new Date(norma.detail.last_seen).toLocaleString()}` : "No runs recorded"}
        fix="/crm/settings/norma"
      />
      <Row
        k="GPS"
        ok={Boolean(gps?.ok)}
        hint={`${gps?.detail?.devices_reporting_24h ?? 0}/${gps?.detail?.devices_total ?? 0} devices · parcels ${gps?.detail?.parcels_matched ?? 0}/${gps?.detail?.parcels_total ?? 0}`}
        fix="/crm/settings/devices"
      />
      <Row
        k="Data"
        ok={Boolean(data?.ok)}
        hint={`${data?.detail?.customers_missing_phone ?? 0} without phone · ${data?.detail?.messages_without_thread ?? 0} orphan messages`}
        fix="/crm/settings"
      />
    </div>
  );
}
