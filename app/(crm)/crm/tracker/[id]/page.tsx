import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { ExceptionActions } from "@/components/crm/ExceptionActions";

export const dynamic = "force-dynamic";

const TYPE_TITLE: Record<string, string> = {
  access_blocked: "Access blocked", yard_not_ready: "Yard not ready", crew_reported: "Crew reported",
  no_gps: "No GPS record", short_visit: "Visit too short", missed: "Missed visit", unverified: "Not verified", flagged: "Flagged for review",
};
const t = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Denver" }) : "";
const tm = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Denver" }) : "";

/** One exception: what the crew hit, what Norma already did, and the two ways out. */
export default async function ExceptionPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ profile, role, realRole, previewing, db }, { id }] = await Promise.all([requireStaff(["owner", "manager"]), params]);
  const { data: ex } = await db.from("exceptions").select("id, job_id, type, detail, wayne_summary, resolved, resolved_at, created_at, severity, crew_id, occurred_on").eq("id", Number(id)).maybeSingle();
  if (!ex) notFound();

  const { data: job } = ex.job_id
    ? await db.from("jobs").select("id, scheduled_date, crew_id, window_start, customer_id, customers(full_name, phone), properties(address, city), crews(name)").eq("id", ex.job_id).maybeSingle()
    : { data: null as any };
  const jj: any = job;
  const cust = jj?.customers; const prop = jj?.properties; const crewName = jj?.crews?.name ?? null;

  const [{ data: dayJobs }, { data: photos }, { data: norma }, { data: alerts }] = await Promise.all([
    jj ? db.from("jobs").select("id").eq("scheduled_date", jj.scheduled_date).eq("crew_id", jj.crew_id ?? -1).neq("status", "cancelled").order("window_start") : Promise.resolve({ data: [] as any[] }),
    ex.job_id ? db.from("job_events").select("photo_url, created_at").eq("job_id", ex.job_id).eq("type", "photo").gte("created_at", new Date(new Date(ex.created_at).getTime() - 30 * 60_000).toISOString()).order("created_at") : Promise.resolve({ data: [] as any[] }),
    cust?.phone ? db.from("messages").select("body, sender, direction, created_at, meta").eq("direction", "outbound").contains("meta", { to: cust.phone }).gte("created_at", new Date(new Date(ex.created_at).getTime() - 5 * 60_000).toISOString()).order("created_at").limit(5) : Promise.resolve({ data: [] as any[] }),
    db.from("automation_runs").select("trigger, created_at, detail").eq("ref_id", String(ex.id)).order("created_at").limit(5),
  ]);
  const photoUrls: string[] = [];
  for (const p of (photos ?? []) as any[]) {
    if (!p.photo_url) continue;
    const { data: signed } = await db.storage.from("job-photos").createSignedUrl(p.photo_url, 3600);
    if (signed?.signedUrl) photoUrls.push(signed.signedUrl);
  }
  const stopIdx = (dayJobs ?? []).findIndex((d: any) => d.id === ex.job_id);
  const title = `${TYPE_TITLE[ex.type] ?? ex.type.replace(/_/g, " ")}${cust?.full_name ? ` — ${cust.full_name.split(" ").slice(-1)[0]}` : ""}`;
  const didSomething = (norma ?? []).length > 0 || (alerts ?? []).length > 0 || Boolean(ex.wayne_summary);

  return (
    <Shell role={role} realRole={realRole} previewing={previewing} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <div className="mx-auto max-w-2xl">
        <nav className="mo-eyebrow mb-4 flex items-center gap-1.5">
          <Link href="/crm/tracker" className="transition hover:text-[color:var(--ink)]">‹ Tracker</Link>
          <span className="text-[color:var(--faint)]">/</span>
          <span>Exception</span>
        </nav>

        <div className={`mo-eyebrow ${ex.resolved ? "text-sage" : ex.severity === "critical" ? "text-coral" : "text-gold"}`}>
          {ex.resolved ? "Resolved" : "Open"} · {t(ex.created_at)}{crewName ? ` · ${crewName}` : ""}{!ex.resolved && ex.severity === "critical" ? " · needs you" : ""}
        </div>
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.03em] text-[color:var(--ink)]">{title}</h1>
        <p className="mb-4 text-[14px] text-[color:var(--body)]">
          {prop ? `${prop.address}${prop.city ? `, ${prop.city}` : ""}` : "No property on record"}{stopIdx >= 0 ? ` · stop ${stopIdx + 1} of ${dayJobs!.length}` : ""}
        </p>

        <section className="mo-card aiv-glow mb-3 px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-[16px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">From the crew</h2>
            <span className="mo-eyebrow">{ex.type === "flagged" ? "Office note" : "Report"}</span>
          </div>
          <p className="mt-2 text-[15px] leading-snug text-[color:var(--ink)]">{ex.detail ? `“${ex.detail}”` : <span className="text-[color:var(--body)]">No note was left.</span>}</p>
          {photoUrls.length > 0 && (
            <div className="mt-3 flex gap-2">
              {photoUrls.slice(0, 3).map((u, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={u} alt="" className="h-20 w-20 rounded-lg border border-[color:var(--border)] object-cover" />
              ))}
            </div>
          )}
        </section>

        <section className="mo-card mb-3 px-4 py-3">
          <h2 className="mb-1 font-display text-[16px] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">What Norma did</h2>
          {!didSomething && <p className="py-2 text-[14px] text-[color:var(--body)]">Nothing yet — this one is waiting on a person.</p>}
          {ex.wayne_summary && <div className="flex gap-3 border-t border-[color:var(--border)] py-2 text-[14px] first:border-t-0"><span className="mo-mono shrink-0 text-[12px] text-[color:var(--body)]">{tm(ex.created_at)}</span><span className="flex-1 text-right text-[color:var(--ink)]">{ex.wayne_summary}</span></div>}
          {(norma ?? []).map((m: any, i: number) => (
            <div key={i} className="flex gap-3 border-t border-[color:var(--border)] py-2 text-[14px]"><span className="mo-mono shrink-0 text-[12px] text-[color:var(--body)]">{tm(m.created_at)}</span><span className="flex-1 text-right text-[color:var(--ink)]">Texted customer: “{m.body}”</span></div>
          ))}
          {(alerts ?? []).map((a: any, i: number) => (
            <div key={`a${i}`} className="flex gap-3 border-t border-[color:var(--border)] py-2 text-[14px]"><span className="mo-mono shrink-0 text-[12px] text-[color:var(--body)]">{tm(a.created_at)}</span><span className="flex-1 text-right text-[color:var(--ink)]">{a.trigger.replace(/[._]/g, " ")}</span></div>
          ))}
        </section>

        {ex.job_id && !ex.resolved && (
          <div className="mo-card mb-4 p-0">
            <Link href={`/crm/jobs/${ex.job_id}`} className="flex items-center justify-between px-4 py-3.5">
              <div><div className="text-[16px] font-semibold text-[color:var(--ink)]">Reschedule</div><div className="text-[13px] text-[color:var(--body)]">Pick a new day on the job sheet; the customer gets the standard text</div></div>
              <span className="text-[color:var(--faint)]">›</span>
            </Link>
            <Link href={`/crm/jobs/${ex.job_id}`} className="flex items-center justify-between border-t border-[color:var(--border)] px-4 py-3.5">
              <div><div className="text-[16px] font-semibold text-[color:var(--ink)]">Open the job sheet</div><div className="text-[13px] text-[color:var(--body)]">Gate, pets, notes and the customer&apos;s number</div></div>
              <span className="text-[color:var(--faint)]">›</span>
            </Link>
          </div>
        )}

        <ExceptionActions id={ex.id} resolved={Boolean(ex.resolved)} jobId={ex.job_id} />
      </div>
    </Shell>
  );
}
