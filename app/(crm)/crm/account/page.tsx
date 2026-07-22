import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { AccountPanel } from "@/components/crm/AccountPanel";

export const dynamic = "force-dynamic";

export default async function Account({ searchParams }: { searchParams: { first?: string } }) {
  // allowMustChange=true so a temp-password user can actually reach this page to fix it
  const { profile, role } = await requireStaff(["owner", "manager", "crew"], true);
  const first = searchParams.first === "1" && profile.must_change_password;
  return (
    <Shell role={role} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <AccountPanel
        profile={{
          full_name: profile.full_name ?? "",
          email: profile.email ?? "",
          phone: profile.phone ?? "",
          theme_pref: profile.theme_pref ?? "light",
          notif_prefs: profile.notif_prefs ?? {},
          role,
        }}
        forcePassword={first}
      />
    </Shell>
  );
}
