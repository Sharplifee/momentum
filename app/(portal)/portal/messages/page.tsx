import { requireCustomer } from "@/lib/portal";
import { PortalShell } from "@/components/portal/PortalShell";
import { PortalChat } from "@/components/portal/PortalChat";

export const dynamic = "force-dynamic";

export default async function Messages() {
  const { customer, admin } = await requireCustomer();
  // unified thread: one row per person, shared with SMS
  let { data: thread } = await admin.from("threads").select("id, escalated").eq("phone", customer.phone).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!thread) {
    const { data: created } = await admin.from("threads").insert({ phone: customer.phone, customer_id: customer.id }).select("id, escalated").single();
    thread = created!;
  } else {
    await admin.from("threads").update({ customer_id: customer.id }).eq("id", thread.id);
  }
  const { data: messages } = await admin
    .from("messages")
    .select("id, direction, sender, channel, body, created_at")
    .eq("thread_id", thread.id)
    .order("created_at")
    .limit(100);

  return (
    <PortalShell name={customer.full_name?.split(" ")[0] ?? ""}>
      <h1 className="mb-1 text-2xl font-bold">Messages</h1>
      <p className="mb-4 text-xs text-white/50">You're chatting with <strong>Wayne, our AI assistant</strong> — ask for a human anytime and our team takes over.{thread.escalated && " (A team member has this conversation now.)"}</p>
      <PortalChat threadId={thread.id} initial={(messages ?? []) as any} escalated={thread.escalated ?? false} />
    </PortalShell>
  );
}
