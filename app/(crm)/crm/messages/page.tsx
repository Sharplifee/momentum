import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { MessagesPanel } from "@/components/crm/MessagesPanel";

export const dynamic = "force-dynamic";

export default async function Messages({ searchParams }: { searchParams: { thread?: string; test?: string } }) {
  const { profile, role, db } = await requireStaff(["owner", "manager"]);
  const showTest = searchParams.test === "1";
  let tq = db
    .from("threads")
    .select("id, phone, escalated, last_message_at, leads(full_name), customers(full_name)")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(80);
  const { data: allThreads } = await tq;
  const isTest = (t: any) => (t.phone ?? "").startsWith("+1555") || /^zz/i.test(t.leads?.full_name ?? t.customers?.full_name ?? "");
  const threads = showTest ? allThreads : (allThreads ?? []).filter((t) => !isTest(t));
  const active = searchParams.thread ?? threads?.[0]?.id;
  const { data: messages } = active
    ? await db.from("messages").select("id, direction, sender, body, created_at").eq("thread_id", active).order("created_at").limit(100)
    : { data: [] };
  const { data: templates } = await db.from("sms_templates").select("id, name, body, sequence_order, delay_minutes, active").order("id");
  const activeThread = (threads ?? []).find((t) => t.id === active);

  return (
    <Shell role={role} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <h1 className="mb-1 font-display text-[28px] font-bold tracking-tight text-[color:var(--ink)] md:text-[32px]">Messages</h1>
      <p className="mb-5 text-sm text-[color:var(--body)]">One thread per person — SMS and portal together.{!searchParams.test && " Test conversations hidden."}</p>
      <MessagesPanel threads={(threads ?? []) as any} activeThread={(activeThread ?? null) as any} messages={(messages ?? []) as any} templates={(templates ?? []) as any} />
    </Shell>
  );
}
