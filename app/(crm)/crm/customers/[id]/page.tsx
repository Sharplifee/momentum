import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";

export const dynamic = "force-dynamic";

export default async function CustomerDetail({ params }: { params: { id: string } }) {
  const { profile, role, db } = await requireStaff(["owner", "manager"]);
  const { data: c } = await db.from("customers").select("*").eq("id", params.id).single();
  if (!c) return <Shell role={role} name={profile.full_name ?? ""} email={profile.email ?? undefined}><p>Not found.</p></Shell>;

  const [{ data: props }, { data: ags }, { data: jobs }, { data: thread }] = await Promise.all([
    db.from("properties").select("*").eq("customer_id", c.id),
    db.from("service_agreements").select("*, services(name)").eq("customer_id", c.id),
    db.from("jobs").select("id, scheduled_date, status, price, services(name)").eq("customer_id", c.id).order("scheduled_date", { ascending: false }).limit(30),
    db.from("threads").select("id").eq("customer_id", c.id).maybeSingle(),
  ]);
  const { data: messages } = thread
    ? await db.from("messages").select("direction, sender, body, created_at").eq("thread_id", thread.id).order("created_at", { ascending: false }).limit(30)
    : { data: [] };

  return (
    <Shell role={role} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <h1 className="mb-1 text-2xl font-bold">{c.full_name}</h1>
      <p className="mb-6 text-sm text-slate">{c.phone} · {c.email ?? "no email"} · {c.status} · LTV ${Number(c.lifetime_value ?? 0).toFixed(0)}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="mo-card p-4">
          <h2 className="mb-2 font-semibold">Properties</h2>
          {(props ?? []).map((p) => (
            <div key={p.id} className="border-b border-[color:var(--border)] py-2 text-sm last:border-0">
              {p.address}, {p.city ?? ""} (zone {p.zone_id ?? "?"}){p.gate_code ? ` · gate ${p.gate_code}` : ""}{p.pets ? ` · pets: ${p.pets}` : ""}
            </div>
          ))}
          <h2 className="mb-2 mt-4 font-semibold">Agreements</h2>
          {(ags ?? []).map((a: any) => (
            <div key={a.id} className="text-sm">{a.services?.name} · {a.frequency} · ${a.price_per_visit}/visit · {a.active ? "active" : "inactive"}</div>
          ))}
        </section>
        <section className="mo-card p-4">
          <h2 className="mb-2 font-semibold">Jobs</h2>
          {(jobs ?? []).map((j: any) => (
            <div key={j.id} className="flex justify-between border-b border-[color:var(--border)] py-1 text-sm last:border-0 ">
              <span>{j.scheduled_date} · {j.services?.name}</span><span>{j.status} {j.price ? `· $${j.price}` : ""}</span>
            </div>
          ))}
        </section>
        <section className="mo-card p-4 lg:col-span-2 ">
          <h2 className="mb-2 font-semibold">Messages</h2>
          {(messages ?? []).map((m, i) => (
            <div key={i} className="border-b border-[color:var(--border)] py-1 text-sm last:border-0 ">
              <span className="text-xs text-slate/70">{m.direction} · {m.sender} · {new Date(m.created_at).toLocaleString()}</span>
              <div>{m.body}</div>
            </div>
          ))}
          {!messages?.length && <p className="text-sm text-slate/70">No messages.</p>}
        </section>
      </div>
    </Shell>
  );
}
