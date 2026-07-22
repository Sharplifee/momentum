import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { MessagesPanel } from "@/components/crm/MessagesPanel";
import { DeltaTile, BandCard, AreaChart } from "@/components/crm/Charts";

export const dynamic = "force-dynamic";

export default async function WayneHQ({ searchParams }: { searchParams: { thread?: string; test?: string } }) {
  const { profile, role, db } = await requireStaff(["owner", "manager"]);
  const showTest = searchParams.test === "1";
  const dayAgo = new Date(Date.now() - 86400_000).toISOString();
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400_000).toISOString();

  const [{ data: allThreads }, { data: templates }, cfg, { data: runs }, { data: recentMsgs }] = await Promise.all([
    db.from("threads").select("id, phone, escalated, last_message_at, leads(full_name), customers(full_name)").order("last_message_at", { ascending: false, nullsFirst: false }).limit(80),
    db.from("sms_templates").select("id, name, body, sequence_order, delay_minutes, active").order("id"),
    db.from("system_config").select("key, value").in("key", ["wayne", "sms_sandbox", "team_alerts"]),
    db.from("automation_runs").select("*").order("created_at", { ascending: false }).limit(60),
    db.from("messages").select("created_at, direction").gte("created_at", twoWeeksAgo).order("created_at"),
  ]);

  const conf: Record<string, any> = {};
  for (const r of cfg.data ?? []) conf[r.key] = r.value;
  const sandbox = conf.sms_sandbox ?? {};
  const wayne = conf.wayne ?? {};

  const isTest = (t: any) => (t.phone ?? "").startsWith("+1555") || /^zz/i.test(t.leads?.full_name ?? t.customers?.full_name ?? "");
  const threads = showTest ? allThreads : (allThreads ?? []).filter((t) => !isTest(t));
  const active = searchParams.thread ?? threads?.[0]?.id;
  const { data: messages } = active
    ? await db.from("messages").select("id, direction, sender, body, created_at").eq("thread_id", active).order("created_at").limit(100)
    : { data: [] };
  const activeThread = (threads ?? []).find((t) => t.id === active);

  const escalated = (threads ?? []).filter((t) => t.escalated).length;
  const msgs24 = (recentMsgs ?? []).filter((m2) => m2.created_at >= dayAgo).length;
  const openConvos = (threads ?? []).filter((t) => t.last_message_at && Date.now() - new Date(t.last_message_at).getTime() < 3 * 86400_000);

  // message volume per day, 14 days
  const dayCounts = Array.from({ length: 14 }, () => 0);
  for (const m2 of recentMsgs ?? []) {
    const idx = 13 - Math.floor((Date.now() - new Date(m2.created_at).getTime()) / 86400_000);
    if (idx >= 0 && idx < 14) dayCounts[idx]++;
  }

  // automation health, grouped by name-ish field
  const groups: Record<string, { ok: number; err: number; last: string }> = {};
  for (const r of (runs ?? []) as any[]) {
    const name = r.automation ?? r.name ?? r.kind ?? r.trigger ?? "automation";
    const ok = r.status ? ["ok", "success", "sent", "completed"].includes(String(r.status).toLowerCase()) : r.ok !== false && !r.error;
    const g = (groups[name] ??= { ok: 0, err: 0, last: r.created_at });
    ok ? g.ok++ : g.err++;
    if (r.created_at > g.last) g.last = r.created_at;
  }

  const chips = [
    { l: `Model ${wayne.model ?? "claude-sonnet-4-6"}`, tone: "teal" },
    sandbox.enabled ? { l: "Sandbox — texts to Connor only", tone: "gold" } : { l: "Live messaging", tone: "green" },
    sandbox.dry_run_default ? { l: "Dry-run — sends simulated", tone: "gold" } : null,
    { l: `${escalated} escalated`, tone: escalated ? "gold" : "teal" },
  ].filter(Boolean) as { l: string; tone: string }[];

  return (
    <Shell role={role} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-teal/80">Customer Relations</div>
      <h1 className="mb-1 font-display text-[28px] font-bold tracking-tight text-[color:var(--ink)] md:text-[32px]">Wayne&apos;s World</h1>
      <p className="mb-4 text-sm text-[color:var(--body)]">Your AI teammate&apos;s live environment — every conversation, workflow, and send in one place.</p>

      <div className="mb-5 flex flex-wrap gap-2">
        {chips.map((c) => (
          <span key={c.l} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${c.tone === "green" ? "bg-green/15 text-green ring-green/30" : c.tone === "gold" ? "bg-gold/15 text-gold ring-gold/30" : "bg-teal/15 text-teal ring-teal/30"}`}>{c.l}</span>
        ))}
      </div>

      {/* ===== Top band ===== */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DeltaTile label="Messages (24h)" value={msgs24} delta="both directions" icon="✉" seed={4} />
        <DeltaTile label="Open Conversations" value={openConvos.length} delta="active < 72h" icon="◎" seed={9} />
        <DeltaTile label="Templates Armed" value={(templates ?? []).filter((t) => t.active !== false).length} delta="instant sends" icon="▤" seed={13} />
        <DeltaTile label="Needs a Human" value={escalated} delta={escalated ? "jump in below" : "all handled"} up={!escalated} icon="🙋" seed={6} />
      </div>

      <div className="mb-6 grid gap-5 lg:grid-cols-5">
        <BandCard title="Conversation volume" sub="last 14 days" className="lg:col-span-3">
          <AreaChart points={dayCounts} height={110} label={`${dayCounts.reduce((a, b) => a + b, 0)} messages exchanged`} />
        </BandCard>
        <BandCard title="Wayne's workflows" sub="live automation health" className="lg:col-span-2">
          <div className="space-y-2.5 text-sm">
            {Object.entries(groups).slice(0, 6).map(([name, g]) => (
              <div key={name} className="flex items-center gap-2.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${g.err ? "bg-gold" : "bg-green"}`} />
                <span className="min-w-0 flex-1 truncate text-[color:var(--ink)]">{name}</span>
                <span className="text-[11px] text-[color:var(--body)]/70">{g.ok} ok{g.err ? ` · ${g.err} err` : ""}</span>
              </div>
            ))}
            {!Object.keys(groups).length && <p className="text-[color:var(--body)]">Quiet — no automation runs yet.</p>}
          </div>
        </BandCard>
      </div>

      {/* ===== Conversations ===== */}
      <h2 className="mb-3 text-[15px] font-semibold text-[color:var(--ink)]">Conversations{!searchParams.test && <span className="ml-2 text-[11px] font-normal text-[color:var(--body)]/60">test threads hidden</span>}</h2>
      <MessagesPanel threads={(threads ?? []) as any} activeThread={(activeThread ?? null) as any} messages={(messages ?? []) as any} templates={(templates ?? []) as any} />
    </Shell>
  );
}
