import { createSign } from "crypto";
import { connect, constants } from "http2";

/**
 * Direct APNs delivery.
 *
 * Push used to hop through Expo's relay, which meant handing Expo a full build
 * credential set we never use just to register a key. Talking to Apple directly
 * removes that: one fewer service in the chain, one fewer vendor to keep
 * credentials current with, and we already hold everything Apple asks for.
 *
 * Apple wants an ES256 JWT signed with the .p8, reused for up to an hour (they
 * rate-limit token minting), over HTTP/2 to api.push.apple.com.
 */

const APNS_HOST = "https://api.push.apple.com";
const TOKEN_TTL_MS = 45 * 60 * 1000; // Apple rejects tokens older than 1h

let cached: { token: string; mintedAt: number } | null = null;

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** DER (what Node emits) → JOSE r||s, which is what JWT ES256 expects. */
function derToJose(der: Buffer): Buffer {
  let offset = 2;
  if (der[1] & 0x80) offset += der[1] & 0x7f;
  const rLen = der[offset + 1];
  const r = der.subarray(offset + 2, offset + 2 + rLen);
  const sStart = offset + 2 + rLen;
  const sLen = der[sStart + 1];
  const s = der.subarray(sStart + 2, sStart + 2 + sLen);
  const pad = (buf: Buffer) => {
    const out = Buffer.alloc(32);
    buf = buf[0] === 0 ? buf.subarray(1) : buf;   // strip DER sign byte
    buf.copy(out, 32 - buf.length);
    return out;
  };
  return Buffer.concat([pad(r), pad(s)]);
}

function providerToken(): string {
  if (cached && Date.now() - cached.mintedAt < TOKEN_TTL_MS) return cached.token;

  const keyId = process.env.APNS_KEY_ID!;
  const teamId = process.env.APNS_TEAM_ID!;
  const p8 = (process.env.APNS_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  if (!keyId || !teamId || !p8) throw new Error("APNs credentials are not configured");

  const header = b64url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const claims = b64url(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }));
  const signer = createSign("SHA256");
  signer.update(`${header}.${claims}`);
  const jose = derToJose(signer.sign(p8));
  const token = `${header}.${claims}.${b64url(jose)}`;

  cached = { token, mintedAt: Date.now() };
  return token;
}

export type ApnsResult =
  | { ok: true }
  | { ok: false; reason: string; retire: boolean; status: number };

export type ApnsMessage = {
  deviceToken: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  badge?: number;
  threadId?: string;
};

/**
 * A device token becomes permanently invalid when the app is deleted or
 * reinstalled. Apple says so precisely, so those tokens get retired rather than
 * retried forever — anything else is a transient failure worth another go.
 */
const PERMANENT = new Set(["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic", "TopicDisallowed"]);

export async function sendApns(msg: ApnsMessage): Promise<ApnsResult> {
  const bundleId = process.env.APNS_BUNDLE_ID ?? "com.momentumlandscapingut.crew";

  const payload = JSON.stringify({
    aps: {
      alert: { title: msg.title, body: msg.body },
      sound: "default",
      ...(msg.badge != null ? { badge: msg.badge } : {}),
      ...(msg.threadId ? { "thread-id": msg.threadId } : {}),
    },
    ...(msg.data ?? {}),
  });

  return new Promise<ApnsResult>((resolve) => {
    let settled = false;
    const done = (r: ApnsResult) => { if (!settled) { settled = true; resolve(r); } };

    let client: ReturnType<typeof connect>;
    try {
      client = connect(APNS_HOST);
    } catch (e: any) {
      return done({ ok: false, reason: e?.message ?? "connect_failed", retire: false, status: 0 });
    }
    client.on("error", (e: any) =>
      done({ ok: false, reason: e?.message ?? "http2_error", retire: false, status: 0 }));

    let req;
    try {
      req = client.request({
        [constants.HTTP2_HEADER_METHOD]: "POST",
        [constants.HTTP2_HEADER_PATH]: `/3/device/${msg.deviceToken}`,
        authorization: `bearer ${providerToken()}`,
        "apns-topic": bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      });
    } catch (e: any) {
      client.close();
      return done({ ok: false, reason: e?.message ?? "request_failed", retire: false, status: 0 });
    }

    let status = 0;
    let raw = "";
    req.setEncoding("utf8");
    req.on("response", (h) => { status = Number(h[":status"] ?? 0); });
    req.on("data", (c) => { raw += c; });
    req.on("error", (e: any) => {
      client.close();
      done({ ok: false, reason: e?.message ?? "stream_error", retire: false, status });
    });
    req.on("end", () => {
      client.close();
      if (status === 200) return done({ ok: true });
      let reason = `http_${status}`;
      try { reason = JSON.parse(raw)?.reason ?? reason; } catch { /* Apple sends text on 5xx */ }
      // 410 means the token died at a timestamp Apple gives us; either way it is gone.
      done({ ok: false, reason, retire: status === 410 || PERMANENT.has(reason), status });
    });

    req.setTimeout(10_000, () => {
      req.close();
      client.close();
      done({ ok: false, reason: "timeout", retire: false, status });
    });

    req.end(payload);
  });
}
