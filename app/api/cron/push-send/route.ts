import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendApns } from "@/lib/apns";

export const runtime = "nodejs";
export const maxDuration = 60;

type Queued = {
  id: number; profile_id: string | null; customer_id: string | null; title: string; body: string;
  data: Record<string, unknown>; category: string | null; attempts: number;
};

/**
 * Drains the push outbox straight to Apple.
 *
 * Notifications are queued by database triggers rather than sent inline, so a
 * slow or failing push service never blocks the request that raised them.
 * Tokens Apple reports as dead are retired — a reinstalled phone issues a new
 * one and the old would otherwise fail forever.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = supabaseAdmin();

  const { data: queued } = await db
    .from("push_queue")
    .select("id, profile_id, customer_id, title, body, data, category, attempts")
    .is("sent_at", null)
    .lte("send_after", new Date().toISOString())
    .lt("attempts", 5)
    .order("id")
    .limit(60);

  if (!queued?.length) return NextResponse.json({ ok: true, sent: 0 });

  // Staff are addressed by profile, customers by customer — one queue, two
  // kinds of recipient, so both sets of devices get looked up together.
  const profileIds = [...new Set(queued.map((q) => q.profile_id).filter(Boolean))] as string[];
  const customerIds = [...new Set(queued.map((q) => q.customer_id).filter(Boolean))] as string[];

  const [staffTokens, customerTokens] = await Promise.all([
    profileIds.length
      ? db.from("push_tokens").select("token, profile_id, bundle_id").in("profile_id", profileIds).eq("active", true)
      : Promise.resolve({ data: [] as any[] }),
    customerIds.length
      ? db.from("push_tokens").select("token, customer_id, bundle_id").in("customer_id", customerIds).eq("active", true)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  type Device = { token: string; bundle_id: string | null };
  const byOwner = new Map<string, Device[]>();
  const add = (owner: string, d: Device) => {
    const list = byOwner.get(owner) ?? [];
    list.push(d);
    byOwner.set(owner, list);
  };
  for (const t of staffTokens.data ?? []) add(`p:${t.profile_id}`, { token: t.token, bundle_id: t.bundle_id });
  for (const t of customerTokens.data ?? []) add(`c:${t.customer_id}`, { token: t.token, bundle_id: t.bundle_id });

  const dead = new Set<string>();
  const delivered: number[] = [];
  const noDevice: number[] = [];
  const failed: { id: number; reason: string; attempts: number }[] = [];

  for (const q of queued as Queued[]) {
    const owner = q.profile_id ? `p:${q.profile_id}` : q.customer_id ? `c:${q.customer_id}` : null;
    const targets = (owner && byOwner.get(owner)) || [];
    if (!targets.length) { noDevice.push(q.id); continue; }

    const results = await Promise.all(
      targets.map(({ token: deviceToken, bundle_id }) =>
        sendApns({
          deviceToken,
          title: q.title,
          body: q.body,
          data: q.data,
          badge: 1,
          threadId: q.category ?? undefined,
          topic: bundle_id ?? undefined,
        }).then((r) => ({ deviceToken, r }))
      )
    );

    // One phone succeeding is enough — the person got the message.
    const anyOk = results.some((x) => x.r.ok);
    for (const { deviceToken, r } of results) {
      if (!r.ok && r.retire) dead.add(deviceToken);
    }
    if (anyOk) {
      delivered.push(q.id);
    } else {
      const first = results.find((x) => !x.r.ok)?.r as any;
      failed.push({ id: q.id, reason: first?.reason ?? "unknown", attempts: (q.attempts ?? 0) + 1 });
    }
  }

  const now = new Date().toISOString();
  if (delivered.length) {
    await db.from("push_queue").update({ sent_at: now }).in("id", delivered);
  }
  if (noDevice.length) {
    // Nobody has the app installed yet — retire rather than retrying forever.
    await db.from("push_queue")
      .update({ sent_at: now, last_error: "no_active_device" })
      .in("id", noDevice);
  }
  for (const f of failed) {
    await db.from("push_queue")
      .update({ attempts: f.attempts, last_error: f.reason })
      .eq("id", f.id);
  }
  if (dead.size) {
    await db.from("push_tokens").update({ active: false }).in("token", [...dead]);
  }

  return NextResponse.json({
    ok: true,
    sent: delivered.length,
    failed: failed.length,
    retired_tokens: dead.size,
    skipped_no_device: noDevice.length,
    errors: failed.slice(0, 5).map((f) => f.reason),
  });
}
