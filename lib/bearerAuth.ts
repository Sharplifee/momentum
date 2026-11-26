import type { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Auth for the native crew app's background calls.
 *
 * Two kinds of Bearer token are accepted:
 *  - a Supabase access token (lifted from the CRM WebView while the app is
 *    open) — valid for about an hour;
 *  - a device token "mdt1.<profile>.<exp>.<sig>", minted by
 *    /api/crm/device-token from a live session and kept by the app in iOS
 *    user defaults. iOS wakes the app in the background to deliver location
 *    long after the hour is up; with only the access token every one of those
 *    pings came back 401 (633 in one week). The device token is checked
 *    against the profile on every call, so a removed or demoted account stops
 *    working immediately.
 */
const DEVICE_DAYS = 180;

function key() {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").update("momentum-device-token-v1").digest();
}

export function mintDeviceToken(profileId: string) {
  const exp = Math.floor(Date.now() / 1000) + DEVICE_DAYS * 86400;
  const body = `mdt1.${profileId}.${exp}`;
  const sig = createHmac("sha256", key()).update(body).digest("base64url");
  return { token: `${body}.${sig}`, expires_at: new Date(exp * 1000).toISOString() };
}

function verifyDeviceToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "mdt1") return null;
  const [, profileId, expS, sig] = parts;
  const expect = createHmac("sha256", key()).update(`mdt1.${profileId}.${expS}`).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== expect.length || !timingSafeEqual(got, expect)) return null;
  if (!(Number(expS) > Date.now() / 1000)) return null;
  return profileId;
}

export async function staffFromBearer(req: NextRequest, roles: string[] = ["owner", "manager", "crew"]) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const db = supabaseAdmin();
  let userId: string | null = null;
  if (token.startsWith("mdt1.")) userId = verifyDeviceToken(token);
  else {
    const { data: { user }, error } = await db.auth.getUser(token);
    if (!error && user) userId = user.id;
  }
  if (!userId) return null;
  const { data: profile } = await db.from("profiles").select("id, role, full_name").eq("id", userId).single();
  if (!profile || !roles.includes(profile.role)) return null;
  return profile;
}
