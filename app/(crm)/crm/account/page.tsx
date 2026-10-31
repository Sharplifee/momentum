import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { AccountPanel } from "@/components/crm/AccountPanel";

export const dynamic = "force-dynamic";

export default async function Account({ searchParams }: { searchParams: { first?: string } }) {
  // allowMustChange=true so a temp-password user can actually reach this page to fix it
  const { profile, role, realRole, previewing } = await requireStaff(["owner", "manager", "crew"], true);
  const first = searchParams.first === "1" && Boolean(profile.must_change_password);
  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mx-auto max-w-2xl">
        <AccountPanel
          profile={{
            full_name: profile.full_name ?? "",
            email: profile.email ?? "",
            phone: profile.phone ?? "",
            notif_prefs: (profile.notif_prefs ?? {}) as Record<string, boolean>,
            role: realRole,
          }}
          previewing={Boolean(previewing)}
          forcePassword={first}
        />
      </div>
    </Shell>
  );
}
