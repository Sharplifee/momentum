import { redirect } from "next/navigation";

/** The weather cron's owner text links here with ?push_zones=…; that is the rain-hold screen now. */
export default function Page({ searchParams }: { searchParams: { push_zones?: string; date?: string } }) {
  if (searchParams.push_zones) {
    const p = new URLSearchParams();
    p.set("zones", searchParams.push_zones);
    if (searchParams.date) p.set("date", searchParams.date);
    redirect(`/crm/schedule/hold?${p}`);
  }
  redirect("/crm/schedule");
}
