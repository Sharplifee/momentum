import { requireCustomer } from "@/lib/portal";
import { PortalShell } from "@/components/portal/PortalShell";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function PortalHome() {
  const { customer, admin } = await requireCustomer();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  const { data: nextJob } = await admin
    .from("jobs")
    .select("id, scheduled_date, window_start, window_end, status, crews(name), services(name), properties(address)")
    .eq("customer_id", customer.id)
    .gte("scheduled_date", today)
    .neq("status", "cancelled")
    .order("scheduled_date")
    .limit(1)
    .maybeSingle();
  const { data: unpaid } = await admin.from("invoices").select("total").eq("customer_id", customer.id).neq("status", "paid");
  const balance = (unpaid ?? []).reduce((s, i) => s + Number(i.total ?? 0), 0);
  const inSeason = true;

  return (
    <PortalShell name={customer.full_name?.split(" ")[0] ?? ""}>
      <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur">
        <h2 className="mb-1 text-sm font-medium text-white/60">Next visit</h2>
        {nextJob ? (
          <>
            <p className="text-2xl font-bold">
              {new Date((nextJob as any).scheduled_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
            <p className="text-white/70">
              {(nextJob as any).services?.name} · {(nextJob as any).crews?.name ?? "crew TBD"}
              {(nextJob as any).status === "in_progress" && <span className="ml-2 rounded-full bg-teal px-2 py-0.5 text-xs">crew on site now</span>}
            </p>
          </>
        ) : (
          <p className="text-white/70">{inSeason ? "Nothing scheduled yet — message us or request service below. 🌱" : "We're between seasons — see you in spring! 🌷"}</p>
        )}
      </div>
      <div className="mt-4 rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur">
        <h2 className="mb-1 text-sm font-medium text-white/60">Balance</h2>
        <p className="text-2xl font-bold">${balance.toFixed(2)}</p>
        {balance > 0 && <p className="text-xs text-white/50">Online payment coming soon — we'll text you a link.</p>}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Link href="/portal/messages" className="rounded-2xl bg-teal p-4 text-center text-sm font-semibold">💬 Message us</Link>
        <Link href="/portal/schedule" className="rounded-2xl border border-white/15 bg-white/10 p-4 text-center text-sm font-semibold backdrop-blur">📅 Reschedule</Link>
        <Link href="/portal/messages?ask=addon" className="rounded-2xl border border-white/15 bg-white/10 p-4 text-center text-sm font-semibold backdrop-blur">➕ Add service</Link>
      </div>
    </PortalShell>
  );
}
