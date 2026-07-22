import { requireStaff } from "@/lib/crm";
import { Shell } from "@/components/crm/Shell";
import { MessagesPanel } from "@/components/crm/MessagesPanel";

export const dynamic = "force-dynamic";

export default async function Messages({ searchParams }: { searchParams: { thread?: string } }) {
  const { profile, role, db } = await requireStaff(["owner", "manager"]);
  const { data: threads } = await db
    .from("threads")
    .select("id, phone, escalated, last_message_at, leads(full_name), customers(full_name)")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(50);
  const active = searchParams.thread ?? threads?.[0]?.id;
  const { data: messages } = active
    ? await db.from("messages").select("id, direction, sender, body, created_at").eq("thread_id", active).order("created_at").limit(100)
    : { data: [] };
  const { data: templates } = await db.from("sms_templates").select("id, name, body, sequence_order, delay_minutes, active").order("id");
  const activeThread = (threads ?? []).find((t) => t.id === active);

  return (
    <Shell role={role} name={profile.full_name ?? ""} email={profile.email ?? undefined}>
      <h1 className="mb-4 text-2xl font-bold">Messages</h1>
      <MessagesPanel threads={(threads ?? []) as any} activeThread={(activeThread ?? null) as any} messages={(messages ?? []) as any} templates={(templates ?? []) as any} />
    </Shell>
  );
}
