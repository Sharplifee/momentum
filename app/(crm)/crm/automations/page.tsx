import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";

export const dynamic = "force-dynamic";

export default async function Automations({ searchParams }: { searchParams: { trigger?: string; status?: string } }) {
  const { profile, role, db } = await requireStaff(["owner", "manager"]);
  let q = db.from("automation_runs").select("id, trigger, ref_id, status, detail, error, created_at").order("created_at", { ascending: false }).limit(100);
  if (searchParams.trigger) q = q.ilike("trigger", `%${searchParams.trigger}%`);
  if (searchParams.status) q = q.eq("status", searchParams.status);
  const { data: runs } = await q;
  const { data: queue } = await db.from("scheduled_sends").select("id, phone, body, send_after, sent_at, canceled").order("send_after", { ascending: false }).limit(30);

  return (
    <Shell role={role} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <h1 className="mb-4 text-2xl font-bold">Automations</h1>
      <form className="mb-3 flex gap-2">
        <input name="trigger" defaultValue={searchParams.trigger} placeholder="Filter trigger…" className="rounded-lg border border-[color:var(--border)] p-2 text-sm dark:border-[color:var(--border)] dark:bg-white/10" />
        <select name="status" defaultValue={searchParams.status} className="rounded-lg border border-[color:var(--border)] p-2 text-sm dark:border-[color:var(--border)] dark:bg-white/10">
          <option value="">any status</option><option>ok</option><option>error</option><option>skipped</option>
        </select>
        <button className="rounded-lg bg-teal px-3 py-2 text-sm text-white">Filter</button>
      </form>
      <div className="mb-8 overflow-x-auto mo-card">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-[color:var(--border)] text-left text-slate dark:border-[color:var(--border)]"><th className="p-2">When</th><th className="p-2">Trigger</th><th className="p-2">Ref</th><th className="p-2">Status</th><th className="p-2">Detail</th></tr></thead>
          <tbody>
            {(runs ?? []).map((r) => (
              <tr key={r.id} className="border-b border-[color:var(--border)]">
                <td className="p-2 text-slate/70">{new Date(r.created_at).toLocaleString("en-US", { timeZone: "America/Denver" })}</td>
                <td className="p-2 font-mono">{r.trigger}</td>
                <td className="p-2 font-mono">{r.ref_id?.slice(0, 8) ?? ""}</td>
                <td className={`p-2 ${r.status === "error" ? "text-red" : r.status === "skipped" ? "text-[oklch(0.55_0.10_70)] dark:text-gold" : "text-[oklch(0.55_0.10_70)] dark:text-gold"}`}>{r.status}</td>
                <td className="p-2 max-w-md truncate">{r.error ?? JSON.stringify(r.detail ?? {})}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="mb-2 font-semibold">Scheduled sends queue</h2>
      <div className="overflow-x-auto mo-card">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-[color:var(--border)] text-left text-slate dark:border-[color:var(--border)]"><th className="p-2">Phone</th><th className="p-2">Body</th><th className="p-2">Send after</th><th className="p-2">State</th></tr></thead>
          <tbody>
            {(queue ?? []).map((s) => (
              <tr key={s.id} className="border-b border-[color:var(--border)]">
                <td className="p-2">{s.phone}</td>
                <td className="p-2 max-w-sm truncate">{s.body}</td>
                <td className="p-2">{new Date(s.send_after).toLocaleString("en-US", { timeZone: "America/Denver" })}</td>
                <td className="p-2">{s.canceled ? "canceled" : s.sent_at ? "sent" : "pending"}</td>
              </tr>
            ))}
            {!queue?.length && <tr><td colSpan={4} className="p-4 text-slate/70">Queue empty.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
