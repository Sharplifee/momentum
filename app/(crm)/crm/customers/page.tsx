import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Customers() {
  const { profile, role, db } = await requireStaff(["owner", "manager"]);
  const { data: customers } = await db
    .from("customers")
    .select("id, full_name, phone, status, lifetime_value, created_at")
    .neq("status", "opted_out")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <Shell role={role} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <h1 className="mb-4 text-2xl font-bold">Customers</h1>
      <div className="overflow-x-auto mo-card">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[color:var(--border)] text-left text-slate dark:border-[color:var(--border)]">
            <th className="p-3">Name</th><th className="p-3">Phone</th><th className="p-3">Status</th><th className="p-3">LTV</th><th className="p-3">Since</th>
          </tr></thead>
          <tbody>
            {(customers ?? []).map((c) => (
              <tr key={c.id} className="border-b border-[color:var(--border)] hover:bg-ice/10">
                <td className="p-3"><Link className="font-medium underline" href={`/crm/customers/${c.id}`}>{c.full_name}</Link></td>
                <td className="p-3">{c.phone}</td>
                <td className="p-3">{c.status}</td>
                <td className="p-3">${Number(c.lifetime_value ?? 0).toFixed(0)}</td>
                <td className="p-3 text-slate/70">{new Date(c.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {!customers?.length && <tr><td colSpan={5} className="p-6 text-slate/70">No customers yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
