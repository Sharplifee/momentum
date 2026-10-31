import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { SettingsPanel, type SettingsRowData, type ChecklistItem } from "@/components/crm/SettingsPanel";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const firstName = (n: string | null | undefined) => (n ?? "").split(" ")[0] || "";

/**
 * Settings is the launch checklist plus one row per sub-screen. Every status
 * dot and every sub-line is read from the database on this request — the row
 * says what is actually configured, never what we hope is.
 */
export default async function Settings() {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner"]);
  const [{ data: cl }, { data: services }, { data: zones }, { data: crews }, { data: templates }, { data: config }, { data: staff }] = await Promise.all([
    db.from("system_config").select("value").eq("key", "launch_checklist").single(),
    db.from("services").select("id, name, active").order("id"),
    db.from("zones").select("id, name, cities, active").order("id"),
    db.from("crews").select("id, name, active").order("id"),
    db.from("sms_templates").select("id, name, active").order("sequence_order", { nullsFirst: false }).order("id"),
    db.from("system_config").select("key, value").in("key", ["sms_sandbox", "sms_provider", "team_alerts", "wayne", "quiet_hours"]),
    db.from("profiles").select("full_name, phone").in("role", ["owner", "manager", "crew"]),
  ]);

  const cfg = (k: string) => (config ?? []).find((c) => c.key === k)?.value as any;
  const items = (((cl?.value as any)?.items ?? []) as { id?: string; label: string; done: boolean }[]);
  const checklist: ChecklistItem[] = items.map((i) => ({ id: i.id ?? i.label, label: i.label, done: Boolean(i.done) }));
  const byId = (id: string) => items.find((i) => i.id === id);

  const sandbox = cfg("sms_sandbox");
  const provider = cfg("sms_provider");
  const alerts = cfg("team_alerts");
  const norma = cfg("wayne");
  const quiet = cfg("quiet_hours");

  const activeServices = (services ?? []).filter((s) => s.active);
  const activeZones = (zones ?? []).filter((z) => z.active);
  const cityCount = new Set(activeZones.flatMap((z) => (z.cities ?? []) as string[])).size;
  const activeCrews = (crews ?? []).filter((c) => c.active);
  const activeTemplates = (templates ?? []).filter((t) => t.active);

  const recipientPhones: string[] = (alerts?.mode === "launch" ? alerts?.launch_recipients : alerts?.recipients) ?? [];
  const recipientNames = recipientPhones.map((p) => firstName((staff ?? []).find((s) => s.phone === p)?.full_name) || p);

  const listOf = (names: string[], max: number) => names.length <= max ? names.join(" · ") : `${names.slice(0, max).join(" · ")} · ${names.length - max} more`;

  const smsOut = byId("sms_outbound");
  const credits = byId("anthropic_credits");

  const rows: SettingsRowData[] = [
    {
      href: "/crm/settings/sms", label: "SMS & texting",
      tone: sandbox?.enabled ? "gold" : smsOut && !smsOut.done ? "coral" : "sage",
      sub: sandbox?.enabled
        ? `Sandbox · ${sandbox.redirect_all_to ? `everything redirects to ${sandbox.redirect_all_to}` : "test traffic only"}`
        : smsOut && !smsOut.done ? `Live on ${provider ?? "—"} · sending is blocked right now` : `Live on ${provider ?? "—"} · customers receive texts`,
    },
    {
      href: "/crm/settings/norma", label: "Norma",
      tone: credits && !credits.done ? "coral" : "sage",
      sub: [norma?.model ? `Model ${norma.model}` : null, quiet ? `quiet ${quiet.no_sends_after}–${quiet.no_sends_before}` : null, credits && !credits.done ? "cannot reply until credits are added" : null].filter(Boolean).join(" · ") || "Not configured",
    },
    {
      href: "/crm/settings/team-alerts", label: "Team alerts",
      tone: recipientNames.length ? "sage" : "gold",
      sub: recipientNames.length ? `New lead · Norma needs a human → ${listOf(recipientNames, 3)}` : "Nobody is on the alert list",
    },
    {
      href: "/crm/settings/services", label: "Services",
      tone: activeServices.length ? "sage" : "gold",
      sub: activeServices.length ? listOf(activeServices.map((s) => s.name), 3) : "No services on",
    },
    {
      href: "/crm/settings/zones", label: "Zones & crews",
      tone: activeZones.length && activeCrews.length ? "sage" : "gold",
      sub: `${activeZones.length} zone${activeZones.length === 1 ? "" : "s"} · ${cityCount} cit${cityCount === 1 ? "y" : "ies"} · ${activeCrews.length ? activeCrews.map((c) => c.name).join(" · ") : "no crew"}`,
    },
    {
      href: "/crm/settings/sms-templates", label: "SMS templates",
      tone: activeTemplates.length ? "sage" : "gold",
      sub: activeTemplates.length ? listOf(activeTemplates.map((t) => t.name.replace(/[-_]+/g, " ")), 4) : "No templates on",
    },
  ];

  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mx-auto max-w-2xl">
        <PageHeader breadcrumb={[{ label: "More", href: "/crm/more" }, { label: "Settings", href: "/crm/settings" }]} title="Settings" />
        <SettingsPanel checklist={checklist} rows={rows} />
      </div>
    </Shell>
  );
}
