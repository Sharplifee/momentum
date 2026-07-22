import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import Link from "next/link";

export const dynamic = "force-dynamic";
const STAGES = ["new", "contacted", "quote_sent", "closed_won", "not_qualified", "stale"] as const;
const STAGE_LABEL: Record<string, string> = { new: "New", contacted: "Contacted", quote_sent: "Quote Sent", closed_won: "Won", not_qualified: "Not Qualified", stale: "Stale" };

export default async function LeadsPage({ searchParams }: { searchParams: { q?: string; stage?: string } }) {
  const { profile, role, db } = await requireStaff(["owner", "manager"]);
  let query = db.from("leads").select("id, full_name, phone, city, zone_id, stage, score, service_interest, quote_amount, created_at").neq("source", "test").order("created_at", { ascending: false }).limit(200);
  if (searchParams.stage) query = query.eq("stage", searchParams.stage);
  if (searchParams.q) query = query.or(`full_name.ilike.%${searchParams.q}%,phone.ilike.%${searchParams.q}%,address.ilike.%${searchParams.q}%`);
  const { data: leads } = await query;

  const counts: Record<string, number> = {};
  const { data: allStages } = await db.from("leads").select("stage").neq("source", "test");
  for (const l of allStages ?? []) counts[l.stage] = (counts[l.stage] ?? 0) + 1;

  return (
    <Shell role={role} name={profile.full_name ?? ""}>
      <h1 className="mb-4 text-2xl font-bold">Leads</h1>
      <form className="mb-3"><input name="q" defaultValue={searchParams.q} placeholder="Search name / phone / address…" className="w-full max-w-md rounded-lg border border-stone-300 p-2 text-sm dark:border-stone-700 dark:bg-stone-800" /></form>
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/crm/leads" className={`rounded-full px-3 py-1 text-sm ${!searchParams.stage ? "bg-moss text-white" : "bg-white dark:bg-stone-800"}`}>All</Link>
        {STAGES.map((s) => (
          <Link key={s} href={`/crm/leads?stage=${s}`} className={`rounded-full px-3 py-1 text-sm ${searchParams.stage === s ? "bg-moss text-white" : "bg-white dark:bg-stone-800"}`}>
            {STAGE_LABEL[s]} ({counts[s] ?? 0})
          </Link>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm dark:bg-stone-900">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-stone-200 text-left text-stone-500 dark:border-stone-700">
            <th className="p-3">Name</th><th className="p-3">Phone</th><th className="p-3">City</th><th className="p-3">Stage</th><th className="p-3">Interest</th><th className="p-3">Quote</th><th className="p-3">Created</th>
          </tr></thead>
          <tbody>
            {(leads ?? []).map((l) => (
              <tr key={l.id} className="border-b border-stone-100 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-800">
                <td className="p-3"><Link className="font-medium underline" href={`/crm/leads/${l.id}`}>{l.full_name ?? "—"}</Link></td>
                <td className="p-3">{l.phone}</td>
                <td className="p-3">{l.city ?? "—"}</td>
                <td className="p-3"><span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs dark:bg-stone-700">{STAGE_LABEL[l.stage] ?? l.stage}</span></td>
                <td className="p-3">{l.service_interest ?? "—"}</td>
                <td className="p-3">{l.quote_amount ? `$${l.quote_amount}` : "—"}</td>
                <td className="p-3 text-stone-400">{new Date(l.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {!leads?.length && <tr><td className="p-6 text-stone-400" colSpan={7}>No leads match.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
