import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";

export const dynamic = "force-dynamic";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FREQ: Record<string, string> = { weekly: "Weekly", biweekly: "Biweekly", monthly: "Monthly", one_time: "One-off" };
const GRADE_LABEL: Record<string, string> = { green: "Green · never messaged", orange: "Orange · standard readiness ask", red: "Red · firm wording + note on site" };
const GRADE_TONE: Record<string, string> = { green: "border-sage/50 text-sage", orange: "border-gold/60 text-gold", red: "border-coral/60 text-coral" };
const initials = (n: string | null) => (n ?? "?").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
const monthYear = (iso: string) => new Date(iso.length === 10 ? iso + "T12:00:00" : iso).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "America/Denver" });
const dayDate = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

/**
 * One account: who they are and where, the three numbers that matter,
 * the curb-side property notes, and the visits we can prove happened.
 */
export default async function CustomerDetail({ params }: { params: { id: string } }) {
  const { profile, role, realRole, previewing, db } = await requireStaff(["owner", "manager"]);
  const { data: c } = await db.from("customers").select("id, full_name, phone, email, status, created_at, lifetime_value, behavior_grade, behavior_grade_override").eq("id", params.id).maybeSingle();
  if (!c) notFound();

  const [{ data: props }, { data: ags }, { data: jobs }, { data: proofs }, { data: open }, { data: thread }] = await Promise.all([
    db.from("properties").select("id, address, city, postal, zone_id, parcel_acres, lot_notes, gate_code, gate_width_in, pets, has_dog, access_notes, watering_day, bags_clippings, haul_clippings, obstacles, premium_handling").eq("customer_id", c.id).order("created_at"),
    db.from("service_agreements").select("id, frequency, day_of_week, price_per_visit, season_start, active, created_at, services(name), crews(name)").eq("customer_id", c.id).order("created_at"),
    db.from("jobs").select("id, scheduled_date, status, price, arrival_at, departure_at, services(name), crews(name)").eq("customer_id", c.id).neq("status", "cancelled").order("scheduled_date", { ascending: false }).limit(40),
    db.from("service_proofs").select("job_id, minutes_on_site").eq("customer_id", c.id),
    db.from("invoices").select("id, number, total, status, due_date").eq("customer_id", c.id).in("status", ["sent", "overdue"]),
    db.from("threads").select("id").eq("customer_id", c.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const { data: messages } = thread
    ? await db.from("messages").select("direction, sender, body, created_at").eq("thread_id", thread.id).order("created_at", { ascending: false }).limit(5)
    : { data: [] as any[] };

  const p: any = props?.[0] ?? null;
  const ag: any = (ags ?? []).find((a: any) => a.active) ?? null;
  const done = (jobs ?? []).filter((j: any) => j.status === "completed");
  const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  const upcoming = (jobs ?? []).filter((j: any) => j.status === "scheduled" && j.scheduled_date >= todayIso).sort((a: any, b: any) => a.scheduled_date.localeCompare(b.scheduled_date));
  const proofBy = new Map((proofs ?? []).map((pr: any) => [pr.job_id, pr]));
  const verified = done.filter((j: any) => proofBy.has(j.id)).length;
  const balance = (open ?? []).reduce((s, i) => s + Number(i.total), 0);
  const since = ag?.season_start ?? ag?.created_at ?? c.created_at;
  const grade = c.behavior_grade_override ?? c.behavior_grade ?? null;
  const minGateIn = 30; // system_config.equipment.min_gate_width_in

  const minutesFor = (j: any) => {
    const pr = proofBy.get(j.id);
    if (pr?.minutes_on_site != null) return pr.minutes_on_site;
    if (j.arrival_at && j.departure_at) return Math.round((new Date(j.departure_at).getTime() - new Date(j.arrival_at).getTime()) / 60_000);
    return null;
  };
  const clippings = p ? (p.haul_clippings ? "Bag · haul" : p.bags_clippings ? "Bag · leave" : "Mulch") : null;
  const pets = p ? (p.pets ?? (p.has_dog ? "Dog on property" : "None")) : null;
  const lot = p ? [p.parcel_acres != null ? `${Number(p.parcel_acres).toFixed(2)} ac` : null, p.lot_notes].filter(Boolean).join(" · ") : "";
  const gate = p ? [p.gate_code, p.gate_width_in != null ? `${p.gate_width_in} in wide${p.gate_width_in < minGateIn ? " · too narrow for the mower" : ""}` : null].filter(Boolean).join(" · ") : "";

  const KV = ({ k, v, tone = "" }: { k: React.ReactNode; v: React.ReactNode; tone?: string }) => (
    <div className="flex items-start justify-between gap-4 border-t border-[color:var(--border)] py-2.5 text-[14px]">
      <span className="shrink-0 text-[color:var(--body)]">{k}</span>
      <span className={`text-right ${tone || "text-[color:var(--ink)]"}`}>{v}</span>
    </div>
  );
  const Dash = <span className="text-[color:var(--faint)]">Not set</span>;
  const act = "flex items-center justify-center gap-1.5 rounded-full border border-teal/50 py-3 text-[14px] font-semibold text-[color:var(--ink)] transition hover:bg-white/[0.04]";

  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mx-auto max-w-2xl">
        <nav className="mo-eyebrow mb-4 flex items-center gap-1.5">
          <Link href="/crm/customers" className="transition hover:text-[color:var(--ink)]">‹ Customers</Link>
          <span className="text-[color:var(--faint)]">/</span>
          <span className="truncate">{c.full_name}</span>
        </nav>

        <div className="mb-4 flex items-start gap-3.5">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.03em] text-[color:var(--ink)]">{c.full_name}</h1>
            <p className="mt-1 text-[13px] text-[color:var(--body)]">{p ? `${p.address}${p.city ? `, ${p.city}` : ""}${p.postal ? ` ${p.postal}` : ""}` : "No property on file"}</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {ag ? <span className="mo-eyebrow rounded-full border border-teal/50 px-2 py-0.5 text-[9px] text-teal">{FREQ[ag.frequency] ?? ag.frequency}{ag.day_of_week != null ? ` · ${DOW[ag.day_of_week]}` : ""}</span>
                : <span className="mo-eyebrow rounded-full border border-[color:var(--border)] px-2 py-0.5 text-[9px]">No plan</span>}
              {p?.zone_id && <span className="mo-eyebrow rounded-full border border-[color:var(--border)] px-2 py-0.5 text-[9px]">Zone {p.zone_id}{p.city ? ` · ${p.city}` : ""}</span>}
              <span className="mo-eyebrow rounded-full border border-[color:var(--border)] px-2 py-0.5 text-[9px]">Since {monthYear(since)}</span>
              {c.status !== "active" && <span className="mo-eyebrow rounded-full border border-gold/60 px-2 py-0.5 text-[9px] text-gold">{c.status}</span>}
              {grade && grade !== "green" && <span className={`mo-eyebrow rounded-full border px-2 py-0.5 text-[9px] ${GRADE_TONE[grade]}`}>{GRADE_LABEL[grade]}{c.behavior_grade_override ? " · override" : ""}</span>}
            </div>
          </div>
          <div className="mo-mono grid h-[52px] w-[52px] shrink-0 place-items-center rounded-2xl border border-[color:var(--border-strong)] text-[16px] font-semibold text-[color:var(--ink)]">{initials(c.full_name)}</div>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <Link href={thread ? `/crm/messages?thread=${thread.id}` : "/crm/messages"} className={act}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M21 12a8 8 0 0 1-8 8H4l2.3-2.9A8 8 0 1 1 21 12z" /></svg>Text
          </Link>
          <a href={`tel:${c.phone}`} className={act}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg>Call
          </a>
          <Link href={upcoming[0] ? `/crm/jobs/${upcoming[0].id}` : "/crm/schedule"} className={act}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M7 3v3M17 3v3M4 8h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" /></svg>Schedule
          </Link>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="mo-card p-3"><div className="mo-eyebrow text-[9px]">Visits</div><div className="mo-num mt-2 text-[22px] leading-none text-[color:var(--ink)]">{done.length}</div></div>
          <div className="mo-card p-3"><div className="mo-eyebrow text-[9px]">Verified</div><div className={`mo-num mt-2 text-[22px] leading-none ${verified ? "text-sage" : "text-[color:var(--ink)]"}`}>{verified}</div></div>
          <div className="mo-card p-3"><div className="mo-eyebrow text-[9px]">Balance</div><div className={`mo-num mt-2 text-[22px] leading-none ${balance > 0 ? "text-coral" : "text-[color:var(--ink)]"}`}>${balance.toFixed(0)}</div></div>
        </div>

        {p ? (
          <Link href={`/crm/customers/${c.id}/property${props && props.length > 1 ? `?p=${p.id}` : ""}`} className="mo-card aiv-glow mb-3 block px-4 pb-1 pt-3.5 transition hover:border-white/20">
            <div className="mb-1.5 flex items-center justify-between">
              <h2 className="font-display text-[15px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">Property</h2>
              <span className="mo-eyebrow text-teal">Edit</span>
            </div>
            <KV k="Lot" v={lot || Dash} />
            <KV k="Gate" v={gate || Dash} tone={p.gate_width_in != null && p.gate_width_in < minGateIn ? "text-coral" : ""} />
            <KV k="Pets" v={pets} />
            <KV k="Clippings" v={clippings} />
            <KV k="Watering day" v={p.watering_day || Dash} />
            {p.obstacles?.length > 0 && <KV k="Obstacles" v={p.obstacles.join(", ")} />}
            {p.access_notes && <KV k="Access" v={p.access_notes} />}
          </Link>
        ) : (
          <div className="mo-card mb-3 px-4 py-4 text-[14px] text-[color:var(--body)]">No property on file for this customer.</div>
        )}

        <section className="mo-card mb-3 px-4 pb-1 pt-3.5">
          <div className="mb-1.5 flex items-baseline justify-between">
            <h2 className="font-display text-[15px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">Recent visits</h2>
            <span className="mo-eyebrow">{done.length ? "Verified" : ""}</span>
          </div>
          {upcoming[0] && <KV k={<span className="text-[color:var(--ink)]">{dayDate(upcoming[0].scheduled_date)}</span>} v={<span className="mo-mono text-[12px] text-teal">Next · {(upcoming[0] as any).services?.name ?? "Visit"}</span>} />}
          {done.slice(0, 6).map((j: any) => {
            const min = minutesFor(j);
            return (
              <Link key={j.id} href={`/crm/jobs/${j.id}`} className="flex items-start justify-between gap-4 border-t border-[color:var(--border)] py-2.5 text-[14px]">
                <span className="text-[color:var(--ink)]">{dayDate(j.scheduled_date)}</span>
                <span className="mo-mono text-right text-[12px] text-[color:var(--body)]">
                  {[j.crews?.name, min != null ? `${min} min` : null].filter(Boolean).join(" · ")}{(j.crews?.name || min != null) ? " · " : ""}
                  {proofBy.has(j.id) ? <span className="text-sage">✓</span> : <span className="text-[color:var(--faint)]">unverified</span>}
                </span>
              </Link>
            );
          })}
          {!done.length && !upcoming[0] && <p className="border-t border-[color:var(--border)] py-3 text-[13px] text-[color:var(--body)]">No visits yet.</p>}
        </section>

        {(ags ?? []).length > 0 && (
          <section className="mo-card mb-3 px-4 pb-1 pt-3.5">
            <h2 className="mb-1.5 font-display text-[15px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">Plan</h2>
            {(ags ?? []).map((a: any) => (
              <KV key={a.id} k={`${a.services?.name ?? "Service"}${a.active ? "" : " · inactive"}`}
                v={`${FREQ[a.frequency] ?? a.frequency}${a.day_of_week != null ? ` · ${DOW[a.day_of_week]}` : ""} · $${Number(a.price_per_visit ?? 0).toFixed(0)}/visit${a.crews?.name ? ` · ${a.crews.name}` : ""}`} />
            ))}
          </section>
        )}

        {(open ?? []).length > 0 && (
          <section className="mo-card mb-3 px-4 pb-1 pt-3.5">
            <h2 className="mb-1.5 font-display text-[15px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">Open invoices</h2>
            {(open ?? []).map((i: any) => (
              <Link key={i.id} href={`/crm/accounting/invoices/${i.id}`} className="flex items-start justify-between gap-4 border-t border-[color:var(--border)] py-2.5 text-[14px]">
                <span className="text-[color:var(--ink)]">MOM-{i.number}{i.due_date ? <span className="text-[color:var(--body)]"> · due {dayDate(i.due_date)}</span> : null}</span>
                <span className={`mo-mono ${i.status === "overdue" ? "text-coral" : "text-[color:var(--ink)]"}`}>${Number(i.total).toFixed(2)}</span>
              </Link>
            ))}
          </section>
        )}

        <section className="mo-card mb-6 px-4 pb-1 pt-3.5">
          <div className="mb-1.5 flex items-baseline justify-between">
            <h2 className="font-display text-[15px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">Messages</h2>
            <span className="mo-eyebrow">{c.phone}{c.email ? ` · ${c.email}` : ""}</span>
          </div>
          {(messages ?? []).map((m: any, i: number) => (
            <div key={i} className="border-t border-[color:var(--border)] py-2.5 text-[13px]">
              <div className="mo-mono text-[10px] text-[color:var(--faint)]">{m.direction === "inbound" ? "them" : m.sender} · {new Date(m.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Denver" })}</div>
              <div className="text-[color:var(--ink)]">{m.body}</div>
            </div>
          ))}
          {!messages?.length && <p className="border-t border-[color:var(--border)] py-3 text-[13px] text-[color:var(--body)]">No messages yet.</p>}
        </section>
      </div>
    </Shell>
  );
}
