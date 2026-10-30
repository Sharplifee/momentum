import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { MessagesPanel } from "@/components/crm/MessagesPanel";
import { DeltaTile, BandCard, AreaChart } from "@/components/crm/Charts";
import { getServiceArea } from "@/lib/serviceArea";

export const dynamic = "force-dynamic";

/** Plain-English names for the machinery. No cron talk, ever. */
const WORKFLOW_LABELS: { match: RegExp; label: string; blurb: string }[] = [
  { match: /scheduled_send/i, label: "Sending queued texts", blurb: "Delivers messages waiting on quiet hours" },
  { match: /nudge/i, label: "Following up with quiet leads", blurb: "Checks back in when someone goes silent" },
  { match: /housekeep/i, label: "Tidying up records", blurb: "Closes stale threads and cleans old data" },
  { match: /dry_run|dry-run/i, label: "Practice sends (sandbox)", blurb: "Simulating texts while testing is on" },
  { match: /inbound|receive/i, label: "Answering incoming texts", blurb: "Reads and replies to what customers send" },
  { match: /alert|team/i, label: "Alerting the team", blurb: "Pings all three of you on new leads" },
  { match: /invoice|billing/i, label: "Sending invoices", blurb: "Bills accounts after completed visits" },
  { match: /reminder|confirm/i, label: "Visit reminders", blurb: "Reminds customers before their visit" },
];
const humanizeWorkflow = (raw: string) => {
  const hit = WORKFLOW_LABELS.find((w) => w.match.test(raw));
  if (hit) return hit;
  const cleaned = raw.replace(/^cron\./i, "").replace(/[._-]+/g, " ").trim();
  return { label: cleaned.charAt(0).toUpperCase() + cleaned.slice(1), blurb: "Runs on a schedule" };
};

export default async function NoraPage({ searchParams }: { searchParams: { thread?: string; test?: string } }) {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner", "manager"]);
  const showTest = searchParams.test === "1";
  const dayAgo = new Date(Date.now() - 86400_000).toISOString();
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400_000).toISOString();

  const [{ data: allThreads }, { data: templates }, cfg, { data: runs }, { data: recentMsgs }, know, area] = await Promise.all([
    db.from("threads").select("id, phone, escalated, last_message_at, leads(full_name), customers(full_name)").order("last_message_at", { ascending: false, nullsFirst: false }).limit(80),
    db.from("sms_templates").select("id, name, body, sequence_order, delay_minutes, active").order("id"),
    db.from("system_config").select("key, value").in("key", ["nora", "sms_sandbox"]),
    db.from("automation_runs").select("*").order("created_at", { ascending: false }).limit(80),
    db.from("messages").select("created_at, direction, sender").gte("created_at", twoWeeksAgo).order("created_at"),
    db.from("nora_knowledge").select("id", { count: "exact", head: true }),
    getServiceArea(),
  ]);

  const conf: Record<string, any> = {};
  for (const r of cfg.data ?? []) conf[r.key] = r.value;
  const sandbox = conf.sms_sandbox ?? {};

  const isTest = (t: any) => (t.phone ?? "").startsWith("+1555") || /^zz/i.test(t.leads?.full_name ?? t.customers?.full_name ?? "");
  const threads = showTest ? allThreads : (allThreads ?? []).filter((t) => !isTest(t));
  const active = searchParams.thread ?? threads?.[0]?.id;
  const { data: messages } = active
    ? await db.from("messages").select("id, direction, sender, body, created_at").eq("thread_id", active).order("created_at").limit(100)
    : { data: [] };
  const activeThread = (threads ?? []).find((t) => t.id === active);

  const escalated = (threads ?? []).filter((t) => t.escalated).length;
  const msgs24 = (recentMsgs ?? []).filter((m) => m.created_at >= dayAgo).length;
  const openConvos = (threads ?? []).filter((t) => t.last_message_at && Date.now() - new Date(t.last_message_at).getTime() < 3 * 86400_000);
  const noraReplies = (recentMsgs ?? []).filter((m) => m.sender === "nora").length;

  const dayCounts = Array.from({ length: 14 }, () => 0);
  for (const m of recentMsgs ?? []) {
    const idx = 13 - Math.floor((Date.now() - new Date(m.created_at).getTime()) / 86400_000);
    if (idx >= 0 && idx < 14) dayCounts[idx]++;
  }

  const groups: Record<string, { ok: number; err: number; last: string }> = {};
  for (const r of (runs ?? []) as any[]) {
    const name = r.automation ?? r.name ?? r.kind ?? r.trigger ?? "automation";
    const ok = r.status ? ["ok", "success", "sent", "completed"].includes(String(r.status).toLowerCase()) : r.ok !== false && !r.error;
    const g = (groups[name] ??= { ok: 0, err: 0, last: r.created_at });
    ok ? g.ok++ : g.err++;
    if (r.created_at > g.last) g.last = r.created_at;
  }

  const ABILITIES = [
    { icon: "01", name: "Offers real open days", desc: "Reads the live crew calendar before promising anything" },
    { icon: "02", name: "Books the visit", desc: "Puts it on the schedule herself — never fakes a confirmation" },
    { icon: "03", name: "Reschedules", desc: "Moves a visit when someone needs a different day" },
    { icon: "04", name: "Starts a quote", desc: "Opens a quote visit so pricing happens in person" },
    { icon: "05", name: "Hands off to a human", desc: "Complaints, damage, refunds, or anger go straight to you" },
    { icon: "06", name: "Remembers the customer", desc: "Pulls their history, property, and past conversations" },
  ];

  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      {/* ===== Norma, the person ===== */}
      <div className="mo-card aiv-glow mb-6 flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
        <div className="relative shrink-0">
          <div className="grid h-20 w-20 place-items-center rounded-xl border border-[color:var(--border)] bg-[color:var(--ink)] font-display text-3xl font-semibold tracking-[-0.04em] text-[#0a0a0a]">N</div>
          <span className={`mo-mono absolute -bottom-1.5 -right-1.5 flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9.5px] font-medium tracking-[0.12em] ${sandbox.enabled ? "border-gold/60 bg-[#0a0a0a] text-gold" : "border-sage/60 bg-[#0a0a0a] text-sage"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${sandbox.enabled ? "bg-gold" : "bg-sage"}`} />{sandbox.enabled ? "TESTING" : "LIVE"}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="mo-eyebrow mb-1">Assistant</div>
          <h1 className="mo-h1 text-[30px]">Norma</h1>
          <p className="mt-1 text-sm font-medium text-teal">Customer relations · answers every text within seconds</p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[color:var(--body)]">
            Norma is the voice customers meet first. She&apos;s friendly, brief, and Utah-neighborly — asks one question at a time,
            uses first names, and never sends a wall of text. She tells the truth about being an AI if asked, never invents a day or a price,
            and hands the conversation to a real person the moment something needs a human touch.
          </p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DeltaTile label="Today" value={msgs24} delta="both directions" icon="✉" seed={4} points={dayCounts} />
        <DeltaTile label="Open" value={openConvos.length} delta="active < 72h" icon="◎" seed={9} />
        <DeltaTile label="Sent" value={noraReplies} delta="last 14 days" icon="⚡" seed={13} />
        <DeltaTile label="Needs you" value={escalated} delta={escalated ? "waiting on you" : "all handled"} up={!escalated} icon="◈" seed={6} />
      </div>

      {/* ===== Who she is: rules, abilities ===== */}
      <div className="mb-6 grid gap-5 lg:grid-cols-2">
        <BandCard title="What Norma can do on her own" sub="real actions, not chat">
          <div className="grid gap-2.5 sm:grid-cols-2">
            {ABILITIES.map((a) => (
              <div key={a.name} className="rounded-lg border border-[color:var(--border)] p-3">
                <div className="mb-0.5 flex items-center gap-2 text-[13px] font-semibold text-[color:var(--ink)]"><span className="mo-eyebrow text-[color:var(--faint)]">{a.icon}</span>{a.name}</div>
                <p className="text-[11.5px] leading-snug text-[color:var(--body)]">{a.desc}</p>
              </div>
            ))}
          </div>
        </BandCard>

        <BandCard title="Lines she will not cross" sub="her standing orders">
          <ul className="space-y-2.5 text-sm">
            {[
              "Never claims to be human — says she's Momentum's assistant if asked",
              "Never quotes a price — every property is quoted in person at the visit",
              "Never offers a day the crew calendar doesn't actually have open",
              "Never says \"you're booked\" unless the visit really landed on the schedule",
              "Never texts outside 8am–9pm — after-hours replies wait for morning",
              "Never shares another customer's information or anything internal",
            ].map((r) => (
              <li key={r} className="flex items-start gap-2.5 text-[color:var(--body)]">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />{r}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-[color:var(--border)] pt-3 text-[11px]">
            <span className="mo-chip px-2.5 py-1 font-medium">{know.count ?? 0} things she knows</span>
            <span className="mo-chip px-2.5 py-1 font-medium">{(templates ?? []).filter((t) => t.active !== false).length} ready-made messages</span>
            <span className="mo-chip px-2.5 py-1 font-medium">Serves {area.cities.length} cities</span>
            <span className="mo-chip px-2.5 py-1 font-medium">Season: Apr 1 – Nov 15</span>
          </div>
        </BandCard>
      </div>

      {/* ===== Her routines, in plain English ===== */}
      <div className="mb-6 grid gap-5 lg:grid-cols-5">
        <BandCard title="Conversation volume" sub="last 14 days" className="lg:col-span-3">
          <AreaChart points={dayCounts} height={110} label={`${dayCounts.reduce((a, b) => a + b, 0)} messages exchanged`} />
        </BandCard>
        <BandCard title="What Norma's been doing" sub="her routines, running now" className="lg:col-span-2">
          <div className="space-y-2.5">
            {Object.entries(groups).slice(0, 6).map(([raw, g]) => {
              const h = humanizeWorkflow(raw);
              return (
                <div key={raw} className="flex items-start gap-2.5">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${g.err ? "bg-gold" : "bg-green"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-[color:var(--ink)]">{h.label}</span>
                    <span className="block text-[11px] text-[color:var(--body)]">{h.blurb}</span>
                  </span>
                  <span className="mo-mono shrink-0 pt-0.5 text-[11px] text-[color:var(--body)]">{g.err ? `${g.err} snag${g.err > 1 ? "s" : ""}` : `${g.ok} done`}</span>
                </div>
              );
            })}
            {!Object.keys(groups).length && <p className="text-sm text-[color:var(--body)]">Quiet right now — nothing running.</p>}
          </div>
        </BandCard>
      </div>

      <h2 className="mb-3 font-display text-[15px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">Her conversations{!searchParams.test && <span className="mo-eyebrow ml-2 inline">test threads hidden</span>}</h2>
      <MessagesPanel threads={(threads ?? []) as any} activeThread={(activeThread ?? null) as any} messages={(messages ?? []) as any} templates={(templates ?? []) as any} />
    </Shell>
  );
}
