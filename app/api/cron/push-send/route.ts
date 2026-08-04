import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendApns } from "@/lib/apns";

export const runtime = "nodejs";
export const maxDuration = 60;

type Queued = {
  id: number; profile_id: string; title: string; body: string;
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
    .select("id, profile_id, title, body, data, category, attempts")
    .is("sent_at", null)
    .lte("send_after", new Date().toISOString())
    .lt("attempts", 5)
    .order("id")
    .limit(60);

  if (!queued?.length) return NextResponse.json({ ok: true, sent: 0 });

  const ids = [...new Set(queued.map((q) => q.profile_id).filter(Boolean))];
  const { data: tokens } = await db
    .from("push_tokens")
    .select("token, profile_id, bundle_id")
    .in("profile_id", ids)
    .eq("active", true);

  type Device = { token: string; bundle_id: string | null };
  const byProfile = new Map<string, Device[]>();
  for (const t of tokens ?? []) {
    const list = byProfile.get(t.profile_id) ?? [];
    list.push({ token: t.token, bundle_id: t.bundle_id });
    byProfile.set(t.profile_id, list);
  }

  const dead = new Set<string>();
  const delivered: number[] = [];
  const noDevice: number[] = [];
  const failed: { id: number; reason: string; attempts: number }[] = [];

  for (const q of queued as Queued[]) {
    const targets = byProfile.get(q.profile_id) ?? [];
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
