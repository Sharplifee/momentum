import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { PageHeader } from "@/components/ui";
import { NormaRulesSettings } from "@/components/crm/settings/NormaRulesSettings";

export const dynamic = "force-dynamic";

/**
 * Norma's rules. Only keys that exist in system_config are shown: quiet_hours
 * (what sendSms enforces), business_hours, season, and the model row under the
 * `wayne` key (display_name Norma). The hand-off list and the voice are the
 * rules in lib/nora.ts's system prompt, shown read-only.
 */
export default async function NormaRulesPage() {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner"]);
  const [{ data: config }, { data: cl }] = await Promise.all([
    db.from("system_config").select("key, value, updated_at").in("key", ["quiet_hours", "business_hours", "season", "wayne"]),
    db.from("system_config").select("value").eq("key", "launch_checklist").single(),
  ]);
  const cfg = (k: string) => (config ?? []).find((c) => c.key === k)?.value as any;
  const credits = (((cl?.value as any)?.items ?? []) as { id?: string; label: string; done: boolean }[]).find((i) => i.id === "anthropic_credits");
  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mx-auto max-w-2xl">
        <PageHeader breadcrumb={[{ label: "Settings", href: "/crm/settings" }, { label: "Norma", href: "/crm/settings/norma" }]} title="Norma"
          sub="How far she goes on her own before handing a conversation to a person." />
        <NormaRulesSettings
          quiet={cfg("quiet_hours") ?? null}
          hours={cfg("business_hours") ?? null}
          season={cfg("season") ?? null}
          model={cfg("wayne") ?? null}
          blocker={credits && !credits.done ? credits.label : null}
        />
      </div>
    </Shell>
  );
}
