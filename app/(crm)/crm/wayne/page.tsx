import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { Card, PageHeader, Chip } from "@/components/ui";
import Link from "next/link";

export const dynamic = "force-dynamic";

const DAYS_AHEAD = 14;

function fmtDay(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric", timeZone: "America/Denver" });
}
function iso(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Denver" });
}

export default async function WaynePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { profile, role, db } = await requireStaff(["owner", "manager"]);
  const { q } = await searchParams;

  const start = new Date();
  const end = new Date(Date.now() + DAYS_AHEAD * 86400_000);

  const [crewsQ, jobsQ, cfgQ, kCountQ, kRowsQ, actionsQ, escalatedQ, templatesQ] = await Promise.all([
    db.from("crews").select("id, name, home_zone, max_daily_jobs").eq("active", true).order("id"),
    db.from("jobs").select("crew_id, scheduled_date").gte("scheduled_date", iso(start)).lte("scheduled_date", iso(end)).not("status", "in", "(canceled)"),
    db.from("system_config").select("key, value").in("key", ["wayne", "sms_sandbox", "business", "season"]),
    db.from("wayne_knowledge").select("id", { count: "exact", head: true }),
    q
      ? db.from("wayne_knowledge").select("id, title, category").ilike("title", `%${q}%`).limit(10)
      : db.from("wayne_knowledge").select("id, title, category").order("created_at", { ascending: false }).limit(8),
    db.from("automation_runs").select("trigger, status, created_at").ilike("trigger", "wayne%").order("id", { ascending: false }).limit(8),
    db.from("threads").select("id", { count: "exact", head: true }).eq("escalated", true),
    db.from("sms_templates").select("id", { count: "exact", head: true }),
  ]);

  const crews = crewsQ.data ?? [];
  const cfg = Object.fromEntries((cfgQ.data ?? []).map((r) => [r.key, r.value as any]));
  const sandbox = cfg.sms_sandbox ?? {};
  const wayneCfg = cfg.wayne ?? {};
  const brainOn = !!process.env.ANTHROPIC_API_KEY;

  // booked counts per crew per day
  const booked = new Map<string, number>();
  for (const j of jobsQ.data ?? []) {
    const k = `${j.crew_id}|${j.scheduled_date}`;
    booked.set(k, (booked.get(k) ?? 0) + 1);
  }
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => new Date(Date.now() + i * 86400_000));

  const sources: { name: string; desc: string; href?: string; live: string }[] = [
    { name: "Availability calendar", desc: "Crew capacity vs booked jobs — the exact math behind every day Wayne offers", live: "below, live", href: "#calendar" },
    { name: "Customer records", desc: "Name, property, gate codes, pets, agreements, history for whoever is texting", live: "per conversation", href: "/crm/customers" },
    { name: "Conversation history", desc: "The full unified SMS + portal thread, both directions", live: "per conversation", href: "/crm/messages" },
    { name: "Knowledge base", desc: `${kCountQ.count ?? 0} entries: services, prices, policies, FAQs, playbooks`, live: "searchable below", href: "#knowledge" },
    { name: "Services & prices", desc: "The live catalog — Wayne can never invent a price", live: "Settings", href: "/crm/settings" },
    { name: "Business rules", desc: "Quiet hours, season window, zones & cities, booking rules", live: "Settings", href: "/crm/settings" },
    { name: "SMS templates", desc: `${templatesQ.count ?? 0} templates for instant structured sends`, live: "Messages", href: "/crm/messages" },
  ];

  return (
    <Shell role={role} name={profile.full_name ?? "there"} email={profile.email}>
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
        <PageHeader title="Wayne" />
        <p className="-mt-4 mb-6 text-sm text-slate">Everything the AI assistant can see and act on — live from the same data he uses mid-conversation.</p>

        {/* status row */}
        <div className="mb-6 flex flex-wrap gap-2">
          <Chip className={brainOn ? "bg-teal/15 text-teal" : "bg-red-500/15 text-red-500"}>{brainOn ? "Brain connected" : "No API key"}</Chip>
          <Chip className={sandbox.enabled ? "bg-amber-500/15 text-amber-600" : "bg-teal/15 text-teal"}>{sandbox.enabled ? "Sandbox: texts go to Connor only" : "Sandbox off — live"}</Chip>
          <Chip className={sandbox.dry_run_default ? "bg-amber-500/15 text-amber-600" : "bg-teal/15 text-teal"}>{sandbox.dry_run_default ? "Dry-run: sends are simulated" : "Real sends on"}</Chip>
          {typeof sandbox.sends_used === "number" && <Chip className={"bg-ice/15 text-slate"}>Send budget {sandbox.sends_used}/{sandbox.max_build_sends ?? "∞"}</Chip>}
          <Chip className={"bg-ice/15 text-slate"}>Model {wayneCfg.model ?? "claude"}</Chip>
          <Chip className={escalatedQ.count ? "bg-amber-500/15 text-amber-600" : "bg-ice/15 text-slate"}>{escalatedQ.count ?? 0} escalated thread{(escalatedQ.count ?? 0) === 1 ? "" : "s"}</Chip>
        </div>

        {/* availability calendar */}
        <div id="calendar" /><Card className="mb-6 overflow-x-auto">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-lg font-bold text-navy dark:text-ice">Availability — next {DAYS_AHEAD} days</h2>
            <span className="text-xs text-slate">what Wayne offers when a customer asks for a day</span>
          </div>
          <table className="w-full min-w-[760px] border-separate border-spacing-1 text-center text-xs">
            <thead>
              <tr>
                <th className="rounded-lg bg-ice/10 px-2 py-2 text-left font-semibold text-slate">Crew</th>
                {days.map((d) => (
                  <th key={iso(d)} className="rounded-lg bg-ice/10 px-1 py-2 font-medium text-slate">{fmtDay(d)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {crews.map((c) => (
                <tr key={c.id}>
                  <td className="rounded-lg bg-ice/10 px-2 py-2 text-left font-medium text-navy dark:text-ice">
                    {c.name}
                    <div className="text-[10px] font-normal text-slate">zone {c.home_zone} · max {c.max_daily_jobs}/day</div>
                  </td>
                  {days.map((d) => {
                    const used = booked.get(`${c.id}|${iso(d)}`) ?? 0;
                    const left = Math.max(0, (c.max_daily_jobs ?? 0) - used);
                    const full = left === 0;
                    const empty = used === 0;
                    return (
                      <td
                        key={iso(d)}
                        title={`${used} booked · ${left} open`}
                        className={`rounded-lg px-1 py-2 font-semibold ${
                          full
                            ? "bg-red-500/15 text-red-500"
                            : empty
                            ? "bg-ice/10 text-slate"
                            : "bg-teal/15 text-teal"
                        }`}
                      >
                        {full ? "Full" : left}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-slate">Numbers = open slots. Wayne offers the two nearest days with an open slot for the lead's zone.</p>
        </Card>

        {/* data sources */}
        <h2 className="mb-3 font-display text-lg font-bold text-navy dark:text-ice">What Wayne reads, live</h2>
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sources.map((s) => (
            <Card key={s.name} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-navy dark:text-ice">{s.name}</span>
                <span className="text-[10px] uppercase tracking-wide text-teal">{s.live}</span>
              </div>
              <p className="text-xs leading-relaxed text-slate">{s.desc}</p>
              {s.href && (
                <Link href={s.href} className="mt-1 text-xs font-medium text-teal hover:underline">
                  Open →
                </Link>
              )}
            </Card>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* knowledge browser */}
          <div id="knowledge" /><Card>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-display text-lg font-bold text-navy dark:text-ice">Knowledge base</h2>
              <span className="text-xs text-slate">{kCountQ.count ?? 0} entries</span>
            </div>
            <form className="mb-3">
              <input
                name="q"
                defaultValue={q ?? ""}
                placeholder="Search what Wayne knows…"
                className="w-full rounded-xl border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-teal"
              />
            </form>
            <ul className="space-y-1.5">
              {(kRowsQ.data ?? []).map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-2 rounded-lg bg-ice/10 px-3 py-2 text-sm">
                  <span className="truncate text-navy dark:text-ice">{k.title}</span>
                  {k.category && <Chip className={"bg-ice/15 text-slate"}>{k.category}</Chip>}
                </li>
              ))}
              {!kRowsQ.data?.length && <li className="text-sm text-slate">Nothing matched — try another word.</li>}
            </ul>
          </Card>

          {/* recent Wayne actions */}
          <Card>
            <h2 className="mb-3 font-display text-lg font-bold text-navy dark:text-ice">Recent Wayne activity</h2>
            <ul className="space-y-1.5">
              {(actionsQ.data ?? []).map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-ice/10 px-3 py-2 text-sm">
                  <span className="text-navy dark:text-ice">{a.trigger.replace("wayne.", "").replace(/[._]/g, " ")}</span>
                  <span className="text-[11px] text-slate">
                    {new Date(a.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Denver" })}
                  </span>
                </li>
              ))}
              {!actionsQ.data?.length && <li className="text-sm text-slate">No Wayne actions yet — he's waiting on his first conversation.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
