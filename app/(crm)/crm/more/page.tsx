import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { MorePanel } from "@/components/crm/MorePanel";

export const dynamic = "force-dynamic";

/**
 * The More tab: account card, admin/crew switch, the workspace screens that are
 * not bottom tabs, and what this device has turned on. Counts are live and the
 * rows are gated by the EFFECTIVE role, so the crew view shows exactly what a
 * crew phone shows.
 */
export default async function MorePage() {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner", "manager", "crew"]);
  const admin = role === "owner" || role === "manager";
  const owner = role === "owner";

  const [customers, overdue, checklist] = await Promise.all([
    admin ? db.from("customers").select("id", { count: "exact", head: true }).neq("status", "opted_out") : Promise.resolve({ count: null as number | null }),
    owner ? db.from("invoices").select("id", { count: "exact", head: true }).eq("status", "overdue") : Promise.resolve({ count: null as number | null }),
    owner ? db.from("system_config").select("value").eq("key", "launch_checklist").single() : Promise.resolve({ data: null as any }),
  ]);
  const blockers = owner ? (((checklist.data?.value as any)?.items ?? []) as { done: boolean }[]).filter((i) => !i.done).length : 0;

  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mx-auto max-w-2xl">
        <MorePanel
          name={profile.full_name ?? ""}
          email={profile.email ?? ""}
          role={role}
          realRole={realRole}
          previewing={Boolean(previewing)}
          counts={{ customers: customers.count ?? null, overdue: overdue.count ?? null, blockers }}
        />
      </div>
    </Shell>
  );
}
