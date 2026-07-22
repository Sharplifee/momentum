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
    <Shell role={role} name={profile.full_name ?? ""}>
      <h1 className="mb-4 text-2xl font-bold">Customers</h1>
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm dark:bg-stone-900">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-stone-200 text-left text-stone-500 dark:border-stone-700">
            <th className="p-3">Name</th><th className="p-3">Phone</th><th className="p-3">Status</th><th className="p-3">LTV</th><th className="p-3">Since</th>
          </tr></thead>
          <tbody>
            {(customers ?? []).map((c) => (
              <tr key={c.id} className="border-b border-stone-100 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-800">
                <td className="p-3"><Link className="font-medium underline" href={`/crm/customers/${c.id}`}>{c.full_name}</Link></td>
                <td className="p-3">{c.phone}</td>
                <td className="p-3">{c.status}</td>
                <td className="p-3">${Number(c.lifetime_value ?? 0).toFixed(0)}</td>
                <td className="p-3 text-stone-400">{new Date(c.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {!customers?.length && <tr><td colSpan={5} className="p-6 text-stone-400">No customers yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
