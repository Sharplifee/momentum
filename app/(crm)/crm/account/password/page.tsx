import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { PasswordPanel } from "@/components/crm/PasswordPanel";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage({ searchParams }: { searchParams: { first?: string } }) {
  // allowMustChange=true: this is the page a temp-password user is sent to fix it.
  const { profile, role, realRole, previewing } = await requireStaff(["owner", "manager", "crew"], true);
  const first = searchParams.first === "1" || Boolean(profile.must_change_password);
  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mx-auto max-w-2xl">
        <PasswordPanel email={profile.email ?? ""} role={role} first={first} />
      </div>
    </Shell>
  );
}
