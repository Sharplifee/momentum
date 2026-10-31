import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { NotificationsList, type Notice } from "@/components/crm/NotificationsList";
import { SOURCE_NAME, fmtPhone } from "@/lib/leadTimeline";

export const dynamic = "force-dynamic";

const DAYS = 14;
const money = (n: unknown) => `$${Number(n ?? 0).toFixed(Number(n) % 1 ? 2 : 0)}`;
const excerpt = (s: string, n = 80) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const humanType = (t: string) => t.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/**
 * What happened, in three groups: Leads (new leads, hand-offs, bookings,
 * wins), Crew (exceptions, route verification, weather), Money (payments,
 * invoices). Every row is a stored event — lead_events, threads, exceptions
 * or automation_runs — nothing is synthesized.
 */
export default async function NotificationsPage() {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner", "manager"]);
  const since = new Date(Date.now() - DAYS * 86400_000).toISOString();

  const [{ data: leadEvents }, { data: escalated }, { data: exceptions }, { data: runs }] = await Promise.all([
    db.from("lead_events").select("id, type, detail, actor, created_at, leads(id, full_name, city, phone, service_interest, source)")
      .in("type", ["created", "job_booked", "stage_change"]).gte("created_at", since).order("created_at", { ascending: false }).limit(80),
    db.from("threads").select("id, phone, last_message_at, leads(full_name), customers(full_name)").eq("escalated", true).order("last_message_at", { ascending: false }).limit(20),
    db.from("exceptions").select("id, type, detail, severity, resolved, resolved_at, created_at, jobs(customers(full_name))").gte("created_at", since).order("created_at", { ascending: false }).limit(60),
    db.from("automation_runs").select("id, trigger, detail, status, created_at")
      .in("trigger", ["payments.paid", "invoice.drafted", "invoice.mark_paid", "verification.eod_all_clear", "verification.eod_followup", "cron.weather", "webhook.crew.exception"])
      .gte("created_at", since).order("created_at", { ascending: false }).limit(120),
  ]);

  // Last thing each handed-off customer said — the line the design quotes.
  const escIds = (escalated ?? []).map((t) => t.id);
  const { data: lastInbound } = escIds.length
    ? await db.from("messages").select("thread_id, body, created_at").in("thread_id", escIds).eq("direction", "inbound").order("created_at", { ascending: false }).limit(60)
    : { data: [] as any[] };
  const saidBy = new Map<string, { body: string; at: string }>();
  for (const m of lastInbound ?? []) if (!saidBy.has(m.thread_id)) saidBy.set(m.thread_id, { body: m.body, at: m.created_at });

  const items: Notice[] = [];
  const isTestLead = (l: any) => !l || (l.phone ?? "").startsWith("+1555") || /^zz/i.test(l.full_name ?? "") || l.source === "test";

  for (const e of (leadEvents ?? []) as any[]) {
    const l = e.leads;
    if (isTestLead(l)) continue;
    const name = l.full_name ?? fmtPhone(l.phone);
    const where = l.city ? `, ${l.city}` : "";
    if (e.type === "created") {
      items.push({ id: `le-${e.id}`, cat: "leads", ts: e.created_at, href: `/crm/leads/${l.id}`, tone: "teal",
        title: `New lead — ${name}${where}`,
        sub: [l.service_interest?.replace(/-/g, " "), l.source ? `via ${SOURCE_NAME[l.source] ?? l.source}` : null].filter(Boolean).join(" · ") || null });
    } else if (e.type === "job_booked") {
      const date = e.detail?.date ? new Date(e.detail.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : null;
      items.push({ id: `le-${e.id}`, cat: "leads", ts: e.created_at, href: `/crm/leads/${l.id}`, tone: "teal", done: true,
        title: `Norma booked a visit${date ? ` for ${date}` : ""}`, sub: name });
    } else if (e.type === "stage_change" && e.detail?.to === "closed_won") {
      items.push({ id: `le-${e.id}`, cat: "leads", ts: e.created_at, href: `/crm/leads/${l.id}`, tone: "gold",
        title: `Won — ${name}${where}`, sub: e.actor && e.actor !== "system" ? `Closed by ${e.actor}` : "Closed by Norma" });
    }
  }

  for (const t of (escalated ?? []) as any[]) {
    if ((t.phone ?? "").startsWith("+1555")) continue;
    const said = saidBy.get(t.id);
    const ts = said?.at ?? t.last_message_at;
    if (!ts) continue;
    items.push({ id: `esc-${t.id}`, cat: "leads", ts, href: `/crm/messages?thread=${t.id}`, tone: "gold",
      title: `${t.leads?.full_name ?? t.customers?.full_name ?? fmtPhone(t.phone)} needs a human`,
      sub: said ? `“${excerpt(said.body)}”` : "Norma paused replies on this thread" });
  }

  for (const x of (exceptions ?? []) as any[]) {
    const who = x.jobs?.customers?.full_name;
    items.push({ id: `exc-${x.id}`, cat: "crew", ts: x.created_at, href: "/crm/tracker", tone: x.severity === "critical" ? "coral" : "gold", done: Boolean(x.resolved),
      title: `${humanType(x.type)}${who ? ` — ${who}` : ""}${x.resolved ? " · resolved" : ""}`,
      sub: x.detail ? excerpt(x.detail) : x.severity ? `${x.severity} severity` : null });
  }

  for (const r of (runs ?? []) as any[]) {
    const d = r.detail ?? {};
    if (r.trigger === "payments.paid") {
      items.push({ id: `run-${r.id}`, cat: "money", ts: r.created_at, href: "/crm/money", tone: "gold", title: `Payment received — ${money(d.amount)}`, sub: d.via === "checkout.session.completed" ? "Paid online" : d.via ?? null });
    } else if (r.trigger === "invoice.mark_paid") {
      items.push({ id: `run-${r.id}`, cat: "money", ts: r.created_at, href: "/crm/money", tone: "gold", title: `Marked paid — ${money(d.amount)}`, sub: [d.method, d.by ? `by ${d.by}` : null].filter(Boolean).join(" · ") || null });
    } else if (r.trigger === "invoice.drafted") {
      items.push({ id: `run-${r.id}`, cat: "money", ts: r.created_at, href: "/crm/money", tone: "teal", done: true, title: `Invoice drafted${d.number ? ` — #${d.number}` : ""}`, sub: d.total != null ? money(d.total) : null });
    } else if (r.trigger === "verification.eod_all_clear") {
      items.push({ id: `run-${r.id}`, cat: "crew", ts: r.created_at, href: "/crm/tracker", tone: "sage", done: true, title: "Route verified · all clear", sub: d.date ? `Every visit on ${new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} checked out` : null });
    } else if (r.trigger === "verification.eod_followup") {
      items.push({ id: `run-${r.id}`, cat: "crew", ts: r.created_at, href: "/crm/tracker", tone: "gold", title: `${d.unresolved ?? "Some"} visit${d.unresolved === 1 ? "" : "s"} unverified at end of day`, sub: Array.isArray(d.crews) && d.crews.length ? d.crews.join(", ") : null });
    } else if (r.trigger === "cron.weather" && Array.isArray(d.flagged) && d.flagged.length) {
      items.push({ id: `run-${r.id}`, cat: "crew", ts: r.created_at, href: "/crm/schedule", tone: "gold", done: true, title: `Rain hold suggested${d.date ? ` for ${new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" })}` : ""}`, sub: `${d.flagged.length} stop${d.flagged.length === 1 ? "" : "s"} flagged` });
    } else if (r.trigger === "webhook.crew.exception") {
      items.push({ id: `run-${r.id}`, cat: "crew", ts: r.created_at, href: "/crm/tracker", tone: "coral", title: "Crew flagged a problem on site", sub: d.note ? `“${excerpt(d.note)}”` : null });
    }
  }

  items.sort((a, b) => (a.ts < b.ts ? 1 : -1));

  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <NotificationsList items={items} />
    </Shell>
  );
}
