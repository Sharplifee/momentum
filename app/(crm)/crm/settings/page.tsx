import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { SettingsPanel } from "@/components/crm/SettingsPanel";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner"]);
  const { data: cl } = await db.from("system_config").select("value").eq("key", "launch_checklist").single();
  const clItems = ((cl?.value as any)?.items ?? []) as { label: string; done: boolean }[];
  const blockers = clItems.filter((i) => !i.done);
  const [{ data: services }, { data: zones }, { data: config }, { data: templates }, { data: crews }] = await Promise.all([
    db.from("services").select("*").order("id"),
    db.from("zones").select("*").order("id"),
    db.from("system_config").select("key, value").order("key"),
    db.from("sms_templates").select("*").order("id"),
    db.from("crews").select("*").order("id"),
  ]);
  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <h1 className="mb-4 font-display text-[28px] font-bold tracking-tight text-[color:var(--ink)] md:text-[32px]">Settings</h1>
        {blockers.length > 0 && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-gold/50 bg-gold/10 p-4 text-sm">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gold text-[12px] font-bold text-black">{blockers.length}</span>
            <div>
              <div className="font-semibold text-[color:var(--ink)]">Attention needed — {blockers.length} item{blockers.length > 1 ? "s" : ""} blocking</div>
              <div className="mt-0.5 text-[color:var(--body)]">{blockers.map((b) => b.label).join(" · ")}</div>
            </div>
          </div>
        )}
        <div className="mo-card mb-5 p-4">
          <h2 className="mb-2 font-semibold text-[color:var(--ink)]">Launch checklist</h2>
          <ul className="space-y-1.5 text-sm">
            {clItems.map((i) => (
              <li key={i.label} className="flex items-center gap-2.5">
                <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold ${i.done ? "bg-green/20 text-green" : "bg-gold/20 text-gold"}`}>{i.done ? "✓" : "!"}</span>
                <span className={i.done ? "text-[color:var(--body)] line-through decoration-[color:var(--border)]" : "text-[color:var(--ink)]"}>{i.label}</span>
              </li>
            ))}
            {!clItems.length && <li className="text-[color:var(--body)]">Nothing tracked.</li>}
          </ul>
        </div>
      <SettingsPanel services={services ?? []} zones={zones ?? []} config={config ?? []} templates={templates ?? []} crews={crews ?? []} />
    </Shell>
  );
}
