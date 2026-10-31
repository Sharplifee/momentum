import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { MessagesPanel, type ThreadRow, type ActiveThread, type Msg, type Draft } from "@/components/crm/MessagesPanel";
import { BandCard, AreaChart } from "@/components/crm/Charts";
import { getServiceArea } from "@/lib/serviceArea";
import { STAGE_NAME, fmtPhone, todayDenver, denverDay } from "@/lib/leadTimeline";

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

const ABILITIES = [
  { icon: "01", name: "Offers real open days", desc: "Reads the live crew calendar before promising anything" },
  { icon: "02", name: "Books the visit", desc: "Puts it on the schedule herself — never fakes a confirmation" },
  { icon: "03", name: "Reschedules", desc: "Moves a visit when someone needs a different day" },
  { icon: "04", name: "Starts a quote", desc: "Opens a quote visit so pricing happens in person" },
  { icon: "05", name: "Hands off to a human", desc: "Complaints, damage, refunds, or anger go straight to you" },
  { icon: "06", name: "Remembers the customer", desc: "Pulls their history, property, and past conversations" },
];
const RULES = [
  "Never claims to be human — says she's Momentum's assistant if asked",
  "Never quotes a price — every property is quoted in person at the visit",
  "Never offers a day the crew calendar doesn't actually have open",
  "Never says \"you're booked\" unless the visit really landed on the schedule",
  "Never texts outside 8am–9pm — after-hours replies wait for morning",
  "Never shares another customer's information or anything internal",
];

/**
 * Norma — who she is, the four numbers that matter, and every conversation.
 * ?thread=ID opens one; ?new=PHONE&lead=ID starts one for a lead who has
 * never texted in. ?test=1 shows the hidden test threads.
 */
export default async function NoraPage({ searchParams }: { searchParams: { thread?: string; test?: string; new?: string; lead?: string } }) {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner", "manager"]);
  const showTest = searchParams.test === "1";
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400_000).toISOString();
  const today = todayDenver();

  const [{ data: allThreads }, { data: templates }, cfg, { data: runs }, { data: recentMsgs }, know, area] = await Promise.all([
    db.from("threads").select("id, phone, escalated, last_message_at, lead_id, customer_id, leads(id, full_name, address, city, service_interest, stage), customers(id, full_name)").order("last_message_at", { ascending: false, nullsFirst: false }).limit(80),
    db.from("sms_templates").select("id, name, body, active").order("id"),
    db.from("system_config").select("key, value").in("key", ["sms_sandbox", "launch_checklist"]),
    db.from("automation_runs").select("trigger, status, error, created_at").order("created_at", { ascending: false }).limit(80),
    db.from("messages").select("thread_id, created_at, direction, sender").gte("created_at", twoWeeksAgo).order("created_at"),
    db.from("nora_knowledge").select("id", { count: "exact", head: true }),
    getServiceArea(),
  ]);
  const sandbox = (cfg.data ?? []).find((r) => r.key === "sms_sandbox")?.value ?? {};
  // Norma's real state comes from the launch checklist probes, not a hard-coded "live".
  const checklistItems = ((((cfg.data ?? []).find((r) => r.key === "launch_checklist")?.value as any)?.items ?? []) as { id?: string; done?: boolean }[]);
  const noCredits = checklistItems.some((i) => i.id === "anthropic_credits" && !i.done);
  const noSms = checklistItems.some((i) => i.id === "sms_outbound" && !i.done);
  const status = noCredits ? { pill: "DOWN", tone: "coral", line: "Not answering — Anthropic credits are out (Settings › Norma)" }
    : noSms ? { pill: "MUTED", tone: "gold", line: "Reads texts but can't send — SMS budget cap reached (Settings › SMS status)" }
    : sandbox.enabled ? { pill: "TESTING", tone: "gold", line: "Replies go to the sandbox number, not customers" }
    : { pill: "LIVE", tone: "sage", line: "Answers every text within seconds" };
  const toneBorder = status.tone === "coral" ? "border-coral/60 text-coral" : status.tone === "gold" ? "border-gold/60 text-gold" : "border-sage/60 text-sage";
  const toneDot = status.tone === "coral" ? "bg-coral" : status.tone === "gold" ? "bg-gold" : "bg-sage";
  const toneText = status.tone === "coral" ? "text-coral" : status.tone === "gold" ? "text-gold" : "text-teal";

  const nameOf = (t: any) => t.leads?.full_name ?? t.customers?.full_name ?? fmtPhone(t.phone);
  const isTest = (t: any) => (t.phone ?? "").startsWith("+1555") || /^zz/i.test(t.leads?.full_name ?? t.customers?.full_name ?? "");
  const threads = ((showTest ? allThreads : (allThreads ?? []).filter((t) => !isTest(t))) ?? []) as any[];
  const ids = new Set(threads.map((t) => t.id));

  // Last line of each conversation, for the list.
  const { data: lastMsgs } = threads.length
    ? await db.from("messages").select("thread_id, direction, sender, body, created_at").in("thread_id", threads.map((t) => t.id)).order("created_at", { ascending: false }).limit(400)
    : { data: [] as any[] };
  const previewBy = new Map<string, { body: string; at: string }>();
  for (const m of lastMsgs ?? []) {
    if (previewBy.has(m.thread_id)) continue;
    const who = m.direction === "inbound" ? "" : m.sender === "nora" ? "Norma: " : m.sender === "staff" ? "Team: " : "";
    previewBy.set(m.thread_id, { body: `${who}${m.body}`, at: m.created_at });
  }

  // Active thread or a brand-new draft for a lead who has never texted in.
  const active = threads.find((t) => t.id === searchParams.thread) ?? null;
  const { data: messages } = active
    ? await db.from("messages").select("id, direction, sender, body, meta, created_at").eq("thread_id", active.id).order("created_at").limit(200)
    : { data: [] as any[] };
  let draft: Draft | null = null;
  if (!active && searchParams.new) {
    const { data: lead } = searchParams.lead ? await db.from("leads").select("id, full_name, phone").eq("id", searchParams.lead).maybeSingle() : { data: null };
    draft = { phone: lead?.phone ?? searchParams.new, lead_id: lead?.id ?? null, name: lead?.full_name ?? fmtPhone(searchParams.new) };
  }
  const threadOpen = Boolean(active || draft);

  // The four numbers — all counted from rows in these threads.
  const real = (recentMsgs ?? []).filter((m) => m.thread_id && ids.has(m.thread_id));
  const todayCount = real.filter((m) => denverDay(m.created_at) === today).length;
  const sentToday = real.filter((m) => m.sender === "nora" && denverDay(m.created_at) === today).length;
  const openCount = threads.filter((t) => t.last_message_at && Date.now() - new Date(t.last_message_at).getTime() < 3 * 86400_000).length;
  const needsYou = threads.filter((t) => t.escalated).length;

  const dayCounts = Array.from({ length: 14 }, () => 0);
  for (const m of real) {
    const idx = 13 - Math.floor((Date.now() - new Date(m.created_at).getTime()) / 86400_000);
    if (idx >= 0 && idx < 14) dayCounts[idx]++;
  }
  const groups: Record<string, { ok: number; err: number }> = {};
  for (const r of runs ?? []) {
    const ok = ["ok", "success", "sent", "completed"].includes(String(r.status ?? "ok").toLowerCase()) && !r.error;
    const g = (groups[r.trigger] ??= { ok: 0, err: 0 });
    ok ? g.ok++ : g.err++;
  }

  const rows: ThreadRow[] = threads.map((t) => ({
    id: t.id, phone: t.phone, escalated: Boolean(t.escalated), last_message_at: t.last_message_at,
    name: nameOf(t), preview: previewBy.get(t.id)?.body ?? null, previewAt: previewBy.get(t.id)?.at ?? t.last_message_at,
  }));
  const activeDetail: ActiveThread | null = active ? {
    id: active.id, phone: active.phone, escalated: Boolean(active.escalated), name: nameOf(active),
    address: active.leads?.address ? `${active.leads.address}${active.leads.city ? `, ${active.leads.city}` : ""}` : null,
    tag: active.leads ? `Lead · ${STAGE_NAME[active.leads.stage] ?? active.leads.stage}` : active.customers ? "Customer" : null,
    personHref: active.leads?.id ? `/crm/leads/${active.leads.id}` : active.customers?.id ? `/crm/customers/${active.customers.id}` : null,
    handedAt: active.escalated ? ([...(messages ?? [])].reverse().find((m: any) => m.direction === "inbound")?.created_at ?? null) : null,
  } : null;

  const Tile = ({ label, value, warn }: { label: string; value: number; warn?: boolean }) => (
    <div className={`mo-card p-2.5 ${warn ? "border-gold/50" : ""}`}>
      <div className={`mo-eyebrow text-[9px] ${warn ? "text-gold" : ""}`}>{label}</div>
      <div className={`mo-num mt-1.5 text-[22px] font-semibold leading-none ${warn ? "text-gold" : "text-[color:var(--ink)]"}`}>{value}</div>
    </div>
  );

  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className={threadOpen ? "hidden lg:block" : ""}>
        <div className="mo-card aiv-glow mb-3 flex items-center gap-3.5 p-4">
          <div className="relative shrink-0">
            <div className="grid h-14 w-14 place-items-center rounded-xl bg-[color:var(--ink)] font-display text-[26px] font-semibold tracking-[-0.04em] text-[#0a0a0a]">N</div>
            <span className={`mo-mono absolute -bottom-1.5 -right-1.5 flex items-center gap-1 rounded-full border bg-[#0a0a0a] px-1.5 py-0.5 text-[9px] tracking-[0.12em] ${toneBorder}`}>
              <span className={`h-[5px] w-[5px] rounded-full ${toneDot}`} />{status.pill}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="mo-eyebrow">Assistant</div>
            <h1 className="mt-1 font-display text-[22px] font-semibold tracking-[-0.03em] text-[color:var(--ink)]">Norma</h1>
            <p className={`mt-0.5 text-[12.5px] ${toneText}`}>{status.line}</p>
          </div>
        </div>

        <div className="mb-3 grid grid-cols-4 gap-1.5">
          <Tile label="Today" value={todayCount} />
          <Tile label="Open" value={openCount} />
          <Tile label="Sent" value={sentToday} />
          <Tile label="Needs you" value={needsYou} warn={needsYou > 0} />
        </div>
      </div>

      <MessagesPanel threads={rows} active={activeDetail} messages={(messages ?? []) as Msg[]} templates={(templates ?? []) as any} draft={draft} firstName={(profile.full_name ?? "the team").split(" ")[0]} />

      {/* ===== Who she is — kept below the conversations ===== */}
      <div className={`mt-8 ${threadOpen ? "hidden lg:block" : ""}`}>
        <div className="mo-eyebrow mb-3">About Norma</div>
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
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
              {RULES.map((r) => (
                <li key={r} className="flex items-start gap-2.5 text-[color:var(--body)]">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />{r}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-[color:var(--border)] pt-3 text-[11px]">
              <span className="mo-chip px-2.5 py-1 font-medium">{know.count ?? 0} things she knows</span>
              <span className="mo-chip px-2.5 py-1 font-medium">{(templates ?? []).filter((t) => t.active !== false).length} ready-made messages</span>
              <span className="mo-chip px-2.5 py-1 font-medium">Serves {area.cities.length} cities</span>
            </div>
          </BandCard>
        </div>
        <div className="grid gap-4 lg:grid-cols-5">
          <BandCard title="Conversation volume" sub="last 14 days" className="lg:col-span-3">
            <AreaChart points={dayCounts} height={110} label={`${dayCounts.reduce((a, b) => a + b, 0)} messages exchanged`} />
          </BandCard>
          <BandCard title="What Norma's been doing" sub="her routines, running now" className="lg:col-span-2">
            <div className="space-y-2.5">
              {Object.entries(groups).slice(0, 6).map(([raw, g]) => {
                const h = humanizeWorkflow(raw);
                return (
                  <div key={raw} className="flex items-start gap-2.5">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${g.err ? "bg-gold" : "bg-sage"}`} />
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
      </div>
    </Shell>
  );
}
