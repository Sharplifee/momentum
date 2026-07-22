import { requireCustomer } from "@/lib/portal";
import { PortalShell } from "@/components/portal/PortalShell";

export const dynamic = "force-dynamic";

export default async function History() {
  const { customer, admin } = await requireCustomer();
  const { data: jobs } = await admin
    .from("jobs")
    .select("id, scheduled_date, departure_at, notes, services(name), crews(name)")
    .eq("customer_id", customer.id)
    .eq("status", "completed")
    .order("scheduled_date", { ascending: false })
    .limit(30);

  const photosByJob: Record<string, string[]> = {};
  for (const j of jobs ?? []) {
    const { data: events } = await admin.from("job_events").select("photo_url").eq("job_id", j.id).eq("type", "photo").limit(4);
    const urls: string[] = [];
    for (const e of events ?? []) {
      if (e.photo_url) {
        const { data: signed } = await admin.storage.from("job-photos").createSignedUrl(e.photo_url, 3600);
        if (signed?.signedUrl) urls.push(signed.signedUrl);
      }
    }
    photosByJob[j.id] = urls;
  }

  return (
    <PortalShell name={customer.full_name?.split(" ")[0] ?? ""}>
      <h1 className="mb-4 text-2xl font-bold">Visit history</h1>
      <div className="space-y-3">
        {(jobs ?? []).map((j: any) => (
          <div key={j.id} className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
            <p className="font-semibold">{new Date(j.scheduled_date + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
            <p className="text-sm text-white/60">{j.services?.name} · {j.crews?.name ?? ""}</p>
            {j.notes && <p className="mt-1 text-sm text-white/70">{j.notes}</p>}
            {photosByJob[j.id]?.length > 0 && (
              <div className="mt-2 flex gap-2 overflow-x-auto">
                {photosByJob[j.id].map((u, i) => (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img key={i} src={u} alt="visit photo" className="h-20 w-20 rounded-lg object-cover" />
                ))}
              </div>
            )}
          </div>
        ))}
        {!jobs?.length && <p className="text-white/60">No completed visits yet.</p>}
      </div>
    </PortalShell>
  );
}
