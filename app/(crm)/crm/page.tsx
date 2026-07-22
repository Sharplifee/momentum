import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const { profile, role, db } = await requireStaff(["owner", "manager"]);

  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const [newL, contacted, quoted, won, wonJobs, resp, activity, checklist] = await Promise.all([
    db.from("leads").select("id", { count: "exact", head: true }).eq("stage", "new").neq("source", "test"),
    db.from("leads").select("id", { count: "exact", head: true }).eq("stage", "contacted").neq("source", "test"),
    db.from("leads").select("id", { count: "exact", head: true }).eq("stage", "quote_sent").neq("source", "test"),
    db.from("leads").select("id", { count: "exact", head: true }).eq("stage", "closed_won").neq("source", "test"),
    db.from("jobs").select("price").eq("status", "completed").gte("created_at", weekAgo),
    db.from("leads").select("response_time_seconds").not("response_time_seconds", "is", null).gte("created_at", weekAgo),
    db.from("lead_events").select("type, detail, actor, created_at").order("created_at", { ascending: false }).limit(12),
    db.from("system_config").select("value").eq("key", "launch_checklist").single(),
  ]);

  const revenue = (wonJobs.data ?? []).reduce((s, j) => s + Number(j.price ?? 0), 0);
  const rts = (resp.data ?? []).map((l) => l.response_time_seconds as number);
  const avgResp = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length / 60) : null;
  const blockers = ((checklist.data?.value as any)?.items ?? []).filter((i: any) => !i.done);

  const stats = [
    { label: "New", value: newL.count ?? 0 },
    { label: "Contacted", value: contacted.count ?? 0 },
    { label: "Quoted", value: quoted.count ?? 0 },
    { label: "Won", value: won.count ?? 0 },
    { label: "Revenue (7d)", value: `$${revenue.toFixed(0)}` },
    { label: "Avg response", value: avgResp != null ? `${avgResp}m` : "—" },
    { label: "Ad spend", value: "— (Phase 5)" },
  ];

  return (
    <Shell role={role} name={profile.full_name ?? ""}>
      <h1 className="mb-4 text-2xl font-bold">Dashboard</h1>
      {blockers.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-950">
          <strong>Launch blockers ({blockers.length}):</strong> {blockers.map((b: any) => b.label).join(" · ")}
        </div>
      )}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl bg-white p-4 shadow-sm dark:bg-stone-900">
            <div className="text-xs text-stone-500">{s.label}</div>
            <div className="text-xl font-bold">{s.value}</div>
          </div>
        ))}
      </div>
      <h2 className="mb-2 font-semibold">Recent activity</h2>
      <div className="space-y-1 rounded-xl bg-white p-4 text-sm shadow-sm dark:bg-stone-900">
        {(activity.data ?? []).map((a, i) => (
          <div key={i} className="flex justify-between border-b border-stone-100 py-1 last:border-0 dark:border-stone-800">
            <span>{a.type} <span className="text-stone-400">({a.actor})</span></span>
            <span className="text-stone-400">{new Date(a.created_at).toLocaleString("en-US", { timeZone: "America/Denver", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
          </div>
        ))}
        {!activity.data?.length && <p className="text-stone-400">No activity yet.</p>}
      </div>
      <p className="mt-4 text-sm"><Link className="underline" href="/crm/leads">Open leads pipeline →</Link></p>
    </Shell>
  );
}
