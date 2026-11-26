import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { FlowTester } from "@/components/crm/FlowTester";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DeveloperToolsPage() {
  const { profile, role, realRole, previewing } = await requireStaff(["owner"]);
  const allowed = process.env.NEXT_PUBLIC_DEV_TOOLS === "1" || process.env.VERCEL_ENV !== "production";
  if (!allowed) notFound();
  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <h1 className="mb-4 font-display text-[24px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">Developer tools</h1>
      <div className="mo-card p-4">
        <div className="mo-eyebrow mb-2 text-coral">Danger · can send real test messages</div>
        <FlowTester />
      </div>
    </Shell>
  );
}
