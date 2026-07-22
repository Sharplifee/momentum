import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { LeadActions } from "@/components/crm/LeadActions";

export const dynamic = "force-dynamic";

export default async function LeadDetail({ params }: { params: { id: string } }) {
  const { profile, role, db } = await requireStaff(["owner", "manager"]);
  const { data: lead } = await db.from("leads").select("*").eq("id", params.id).single();
  if (!lead) return <Shell role={role} name={profile.full_name ?? ""}><p>Lead not found.</p></Shell>;

  const [{ data: events }, { data: thread }, { data: quotes }, { data: services }] = await Promise.all([
    db.from("lead_events").select("type, detail, actor, created_at").eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(50),
    db.from("threads").select("id").eq("lead_id", lead.id).maybeSingle(),
    db.from("quotes").select("id, line_items, total, status, created_at").eq("lead_id", lead.id).order("created_at", { ascending: false }),
    db.from("services").select("name, slug, base_price").eq("active", true),
  ]);
  const { data: messages } = thread
    ? await db.from("messages").select("direction, sender, body, created_at").eq("thread_id", thread.id).order("created_at", { ascending: false }).limit(50)
    : { data: [] };

  const timeline = [
    ...(events ?? []).map((e) => ({ ts: e.created_at, kind: `event:${e.type}`, body: JSON.stringify(e.detail ?? {}).slice(0, 120), actor: e.actor })),
    ...(messages ?? []).map((m) => ({ ts: m.created_at, kind: `${m.direction} sms`, body: m.body, actor: m.sender })),
  ].sort((a, b) => (a.ts < b.ts ? 1 : -1));

  return (
    <Shell role={role} name={profile.full_name ?? ""}>
      <h1 className="mb-1 text-2xl font-bold">{lead.full_name ?? "Lead"}</h1>
      <p className="mb-4 text-sm text-stone-500">{lead.phone} · {lead.address}, {lead.city ?? "?"} · zone {lead.zone_id ?? "?"} · stage <strong>{lead.stage}</strong>{lead.proposed_date ? ` · proposed ${lead.proposed_date}` : ""}</p>
      <LeadActions lead={{ id: lead.id, stage: lead.stage, phone: lead.phone, thread_id: thread?.id ?? null }} services={services ?? []} quotes={quotes ?? []} />
      <h2 className="mb-2 mt-8 font-semibold">Timeline</h2>
      <div className="space-y-2">
        {timeline.map((t, i) => (
          <div key={i} className="rounded-lg bg-white p-3 text-sm shadow-sm dark:bg-stone-900">
            <div className="flex justify-between text-xs text-stone-400">
              <span>{t.kind} · {t.actor}</span>
              <span>{new Date(t.ts).toLocaleString("en-US", { timeZone: "America/Denver" })}</span>
            </div>
            <div className="mt-1 whitespace-pre-wrap">{t.body}</div>
          </div>
        ))}
        {!timeline.length && <p className="text-sm text-stone-400">No history yet.</p>}
      </div>
    </Shell>
  );
}
