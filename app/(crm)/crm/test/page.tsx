import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { FlowTester } from "@/components/crm/FlowTester";

export const dynamic = "force-dynamic";

export default async function TestPage() {
  const { profile, role } = await requireStaff(["owner"]);
  return (
    <Shell role={role} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <h1 className="mb-4 text-2xl font-bold">Flow Tester</h1>
      <FlowTester />
    </Shell>
  );
}
