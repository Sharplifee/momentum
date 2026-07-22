import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { Card, StatCard, PageHeader, Chip } from "@/components/ui";
import { STAGE_STYLE, STAGE_LABEL } from "@/lib/theme";
import Link from "next/link";

/** Tiny deterministic sparkline like the Aivora cards. */
function Spark({ seed, up = true }: { seed: number; up?: boolean }) {
  const pts: number[] = [];
  let v = 30 + (seed % 20);
  for (let i = 0; i < 12; i++) { v += Math.sin((i + seed) * 1.7) * 8 + (up ? 1.5 : -1); pts.push(Math.max(6, Math.min(44, v))); }
  const d = pts.map((y, i) => `${i === 0 ? "M" : "L"}${(i * 100) / 11},${50 - y}`).join(" ");
  return (
    <svg viewBox="0 0 100 50" className="h-10 w-full" preserveAspectRatio="none">
      <defs><linearGradient id={`g${seed}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b7cf6" stopOpacity="0.35"/><stop offset="100%" stopColor="#8b7cf6" stopOpacity="0"/></linearGradient></defs>
      <path d={`${d} L100,50 L0,50 Z`} fill={`url(#g${seed})`} />
      <path d={d} fill="none" stroke="#a99df8" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function StatTile({ label, value, sub, href, icon, seed }: { label: string; value: string | number; sub?: string; href?: string; icon: string; seed: number }) {
  const body = (
    <div className="mo-card aiv-glow flex flex-col gap-2 p-4 transition hover:shadow-glow">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal/15 text-base text-teal ring-1 ring-teal/25">{icon}</span>
        <span className="text-[13px] font-medium text-slate">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="font-display text-[30px] font-bold leading-none text-navy">{value}</span>
        {sub && <span className="pb-1 text-[11px] font-medium text-green">{sub}</span>}
      </div>
      <Spark seed={seed} />
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}


export const dynamic = "force-dynamic";

/** Turn a raw automation/lead_event into a human sentence. */
function humanize(row: { trigger?: string; type?: string; detail?: any; actor?: string }): string {
  const t = row.trigger ?? row.type ?? "";
  const d = row.detail ?? {};
  if (t === "created" || t === "leads.create") return `New lead came in${d.zone_id ? ` in zone ${d.zone_id}` : ""}`;
  if (t.startsWith("stage.")) return `Lead moved to ${STAGE_LABEL[(t.split(".")[1] as keyof typeof STAGE_LABEL)] ?? t.split(".")[1]}`;
  if (t === "stage_change") return `Stage → ${STAGE_LABEL[(d.to as keyof typeof STAGE_LABEL)] ?? d.to}`;
  if (t === "wayne.book_job" || t === "job_booked") return `Wayne booked a visit${d.date ? ` for ${new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}` : ""}`;
  if (t === "invoice.drafted") return `Invoice drafted${d.total ? ` — $${d.total}` : ""}`;
  if (t === "invoice.mark_paid" || t === "payments.paid") return `Payment received${d.amount ? ` — $${d.amount}` : ""}`;
  if (t === "wayne.escalate") return `Wayne handed a conversation to the team`;
  if (t === "note") return `Note: ${(d.note ?? "").slice(0, 60)}`;
  if (t === "reminder_sent") return `Day-before reminder sent`;
  return t.replace(/[._]/g, " ");
}

export default async function Dashboard() {
  const { profile, role, db } = await requireStaff(["owner", "manager"]);
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const [newL, contacted, quoted, won, wonJobs, resp, activity, checklist] = await Promise.all([
    db.from("leads").select("id", { count: "exact", head: true }).eq("stage", "new").neq("source", "test"),
    db.from("leads").select("id", { count: "exact", head: true }).eq("stage", "contacted").neq("source", "test"),
    db.from("leads").select("id", { count: "exact", head: true }).eq("stage", "quote_sent").neq("source", "test"),
    db.from("leads").select("id", { count: "exact", head: true }).eq("stage", "closed_won").neq("source", "test"),
    db.from("jobs").select("price").eq("status", "completed").gte("created_at", weekAgo),
    db.from("leads").select("response_time_seconds").not("response_time_seconds", "is", null).gte("created_at", weekAgo),
    db.from("lead_events").select("type, detail, actor, created_at, lead_id").order("created_at", { ascending: false }).limit(12),
    db.from("system_config").select("value").eq("key", "launch_checklist").single(),
  ]);

  const revenue = (wonJobs.data ?? []).reduce((s, j) => s + Number(j.price ?? 0), 0);
  const rts = (resp.data ?? []).map((l) => l.response_time_seconds as number);
  const avgResp = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length / 60) : null;
  const blockers = ((checklist.data?.value as any)?.items ?? []).filter((i: any) => !i.done);

  // pipeline bar (teal scale)
  const byStage: Record<string, number> = { new: newL.count ?? 0, contacted: contacted.count ?? 0, quote_sent: quoted.count ?? 0, closed_won: won.count ?? 0 };
  const maxStage = Math.max(1, ...Object.values(byStage));

  const stats = [
    { label: "New Leads", value: newL.count ?? 0, sub: "this week", href: "/crm/leads?stage=new", icon: "◎", seed: 3 },
    { label: "Contacted", value: contacted.count ?? 0, sub: "in motion", href: "/crm/leads?stage=contacted", icon: "☏", seed: 7 },
    { label: "Quoted", value: quoted.count ?? 0, sub: "awaiting reply", href: "/crm/leads?stage=quote_sent", icon: "▤", seed: 11 },
    { label: "Revenue (7d)", value: `$${revenue.toFixed(0)}`, sub: "+ live", href: "/crm/money", icon: "◈", seed: 5 },
  ];

  return (
    <Shell role={role} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-teal/80">Dashboard</div>
      <PageHeader title={`Welcome back, ${(profile.full_name ?? "").split(" ")[0]}`} action={<Link href="/crm/leads" className="mo-primary rounded-xl px-4 py-2 text-sm font-medium shadow-card">View pipeline →</Link>} />

      {blockers.length > 0 && (
        <div className="mb-6 rounded-2xl border border-gold/40 bg-gold/10 p-4 text-sm text-navy dark:text-ice">
          <strong>Launch blockers ({blockers.length}):</strong> {blockers.map((b: any) => b.label).join(" · ")}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => <StatTile key={s.label} {...s} />)}
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <h2 className="mo-h1 mb-3 text-base">Pipeline</h2>
          <div className="space-y-2.5">
            {(["new", "contacted", "quote_sent", "closed_won"] as const).map((st) => (
              <Link key={st} href={`/crm/leads?stage=${st}`} className="block">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-slate">{STAGE_LABEL[st]}</span><span className="font-medium text-navy dark:text-ice">{byStage[st]}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-ice/15">
                  <div className={`h-full rounded-full ${st === "closed_won" ? "bg-gold" : "bg-teal"}`} style={{ width: `${(byStage[st] / maxStage) * 100}%` }} />
                </div>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-3">
          <h2 className="mo-h1 mb-3 text-base">Recent activity</h2>
          <div className="space-y-1">
            {(activity.data ?? []).map((a, i) => (
              <Link key={i} href={a.lead_id ? `/crm/leads/${a.lead_id}` : "/crm/wayne"}
                className="flex items-center justify-between rounded-xl border border-[color:var(--border)] bg-white/[0.02] px-3 py-2.5 text-sm transition hover:border-teal/40 hover:bg-teal/[0.06]">
                <span className="text-navy dark:text-ice">{humanize(a)}</span>
                <span className="shrink-0 text-xs text-slate/70">{new Date(a.created_at).toLocaleString("en-US", { timeZone: "America/Denver", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              </Link>
            ))}
            {!activity.data?.length && <p className="py-6 text-center text-sm text-slate">Quiet so far — new activity shows up here.</p>}
          </div>
        </Card>
      </div>
    </Shell>
  );
}
