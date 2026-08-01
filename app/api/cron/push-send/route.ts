import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const EXPO_ENDPOINT = "https://exp.host/--/api/v2/push/send";

type Queued = {
  id: number; profile_id: string; title: string; body: string;
  data: Record<string, unknown>; category: string | null;
};

/**
 * Drains the push outbox.
 *
 * Notifications are queued by database triggers rather than sent inline, so a
 * slow or failing push service never blocks the request that raised them. This
 * route batches by device and retires tokens that the push service reports as
 * dead — a reinstalled phone issues a new token and the old one would otherwise
 * fail forever.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = supabaseAdmin();

  const { data: queued } = await db
    .from("push_queue")
    .select("id, profile_id, title, body, data, category")
    .is("sent_at", null)
    .lte("send_after", new Date().toISOString())
    .lt("attempts", 5)
    .order("id")
    .limit(100);

  if (!queued?.length) return NextResponse.json({ ok: true, sent: 0 });

  const ids = [...new Set(queued.map((q) => q.profile_id).filter(Boolean))];
  const { data: tokens } = await db
    .from("push_tokens")
    .select("token, profile_id")
    .in("profile_id", ids)
    .eq("active", true);

  const byProfile = new Map<string, string[]>();
  for (const t of tokens ?? []) {
    const list = byProfile.get(t.profile_id) ?? [];
    list.push(t.token);
    byProfile.set(t.profile_id, list);
  }

  const messages: any[] = [];
  const rowFor: number[] = [];
  const noDevice: number[] = [];

  for (const q of queued as Queued[]) {
    const targets = byProfile.get(q.profile_id) ?? [];
    if (!targets.length) { noDevice.push(q.id); continue; }
    for (const to of targets) {
      messages.push({
        to, title: q.title, body: q.body, data: q.data,
        sound: "default", priority: "high",
        channelId: q.category ?? "default",
        badge: 1,
      });
      rowFor.push(q.id);
    }
  }

  // Nobody has that app installed yet — retire the row rather than retrying forever.
  if (noDevice.length) {
    await db.from("push_queue")
      .update({ sent_at: new Date().toISOString(), last_error: "no_active_device" })
      .in("id", noDevice);
  }
  if (!messages.length) return NextResponse.json({ ok: true, sent: 0, skipped: noDevice.length });

  const dead: string[] = [];
  const delivered = new Set<number>();
  const failed = new Map<number, string>();

  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(chunk),
      });
      const json = await res.json().catch(() => ({}));
      const tickets: any[] = json?.data ?? [];
      tickets.forEach((t, j) => {
        const rowId = rowFor[i + j];
        if (t?.status === "ok") { delivered.add(rowId); return; }
        failed.set(rowId, t?.message ?? "push_error");
        if (t?.details?.error === "DeviceNotRegistered") dead.push(chunk[j].to);
      });
    } catch (e: any) {
      chunk.forEach((_, j) => failed.set(rowFor[i + j], e?.message ?? "network_error"));
    }
  }

  if (delivered.size) {
    await db.from("push_queue")
      .update({ sent_at: new Date().toISOString() })
      .in("id", [...delivered]);
  }
  for (const [id, err] of failed) {
    if (delivered.has(id)) continue;
    const row = queued.find((q) => q.id === id);
    await db.from("push_queue")
      .update({ attempts: (row as any)?.attempts ?? 1, last_error: err })
      .eq("id", id);
  }
  if (dead.length) {
    await db.from("push_tokens").update({ active: false }).in("token", dead);
  }

  return NextResponse.json({
    ok: true,
    sent: delivered.size,
    failed: failed.size,
    retired_tokens: dead.length,
    skipped_no_device: noDevice.length,
  });
}
