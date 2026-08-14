/**
 * Face ID / Touch ID unlock for the CRM.
 *
 * The problem this solves: Connor, Terick and Kayden should type their password
 * once on a device and never again. The browser's own password manager covers
 * the autofill half; this covers the rest — after the first successful sign-in
 * we enroll a platform authenticator (Face ID on iPhone, Touch ID on Mac,
 * fingerprint on Android) and stash the Supabase refresh token behind it.
 *
 * On every later visit the login page asks for the face instead of the password.
 *
 * Where the token lives: when the authenticator supports the PRF extension
 * (modern iOS, Android and Chrome do) we derive an AES-GCM key from it and
 * encrypt the refresh token, so the stored blob is worthless without a real
 * biometric ceremony on that specific device. When PRF is unavailable we fall
 * back to storing the token directly — still gated by the ceremony, and no
 * weaker than the session cookie already sitting in the same browser.
 */

const KEY = "mo.bio.v1";
const RP_NAME = "Momentum Landscaping";
const PRF_SALT: Uint8Array<ArrayBuffer> = (() => {
  const src = new TextEncoder().encode("momentum-crm-biometric-v1");
  const out = new Uint8Array(new ArrayBuffer(src.length));
  out.set(src);
  return out;
})();

type Stored = {
  credentialId: string; // base64url
  email: string;
  prf: boolean;
  iv?: string; // base64url, present when prf
  token: string; // base64url ciphertext when prf, else the raw refresh token
};

/* ---------- base64url helpers ---------- */

function toB64u(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64u(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = pad + "=".repeat((4 - (pad.length % 4)) % 4);
  const raw = atob(padded);
  const buf = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/* ---------- storage ---------- */

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

export function enrolledEmail(): string | null {
  return read()?.email ?? null;
}

export function isEnrolled(): boolean {
  return read() !== null;
}

export function clearEnrollment() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** True when this device can do a built-in biometric (not a security key). */
export async function isSupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!window.PublicKeyCredential || !navigator.credentials) return false;
  if (!window.isSecureContext) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/* ---------- crypto ---------- */

async function aesKeyFromPrf(prf: ArrayBuffer): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", prf, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: PRF_SALT, info: PRF_SALT },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function prfOutput(cred: PublicKeyCredential): ArrayBuffer | null {
  const ext = cred.getClientExtensionResults() as any;
  const first = ext?.prf?.results?.first;
  if (!first) return null;
  if (first instanceof ArrayBuffer) return first;
  const view = first as Uint8Array;
  const copy = new ArrayBuffer(view.byteLength);
  new Uint8Array(copy).set(view);
  return copy;
}

/* ---------- enroll ---------- */

/**
 * Called right after a successful password sign-in. Creates the platform
 * credential, then immediately runs an assertion to pull the PRF output so the
 * refresh token can be wrapped. Returns false if the user cancels — never throws
 * at the caller, because failing to set up Face ID must not block signing in.
 */
export async function enroll(email: string, refreshToken: string): Promise<boolean> {
  try {
    if (!(await isSupported())) return false;

    const userId = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
    const challenge = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32)));

    const created = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: RP_NAME, id: window.location.hostname },
        user: { id: userId, name: email, displayName: email },
        // ES256 then RS256 — covers every platform authenticator in the wild.
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        timeout: 60_000,
        attestation: "none",
        extensions: { prf: {} } as any,
      },
    })) as PublicKeyCredential | null;

    if (!created) return false;
    const credentialId = toB64u(created.rawId);

    // Second ceremony: creation does not reliably return PRF output, an
    // assertion does. If this one is declined we simply store without wrapping.
    let prf: ArrayBuffer | null = null;
    try {
      const asserted = (await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32))),
          rpId: window.location.hostname,
          allowCredentials: [{ type: "public-key", id: fromB64u(credentialId) }],
          userVerification: "required",
          timeout: 60_000,
          extensions: { prf: { eval: { first: PRF_SALT } } } as any,
        },
      })) as PublicKeyCredential | null;
      if (asserted) prf = prfOutput(asserted);
    } catch {
      /* fall through to unwrapped storage */
    }

    let record: Stored;
    if (prf) {
      const key = await aesKeyFromPrf(prf);
      const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
      const plainBytes = new TextEncoder().encode(refreshToken);
      const plainBuf = new ArrayBuffer(plainBytes.length);
      new Uint8Array(plainBuf).set(plainBytes);
      const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plainBuf);
      record = { credentialId, email, prf: true, iv: toB64u(iv), token: toB64u(ct) };
    } else {
      record = { credentialId, email, prf: false, token: refreshToken };
    }

    localStorage.setItem(KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

/* ---------- unlock ---------- */

export type UnlockResult =
  | { ok: true; refreshToken: string }
  | { ok: false; reason: "none" | "cancelled" | "stale" };

/**
 * Runs the Face ID prompt and hands back the refresh token. "stale" means the
 * credential is gone or the stored token no longer decrypts — the caller should
 * wipe the enrollment and fall back to the password form.
 */
export async function unlock(): Promise<UnlockResult> {
  const rec = read();
  if (!rec) return { ok: false, reason: "none" };

  let asserted: PublicKeyCredential | null;
  try {
    asserted = (await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32))),
        rpId: window.location.hostname,
        allowCredentials: [{ type: "public-key", id: fromB64u(rec.credentialId) }],
        userVerification: "required",
        timeout: 60_000,
        extensions: rec.prf ? ({ prf: { eval: { first: PRF_SALT } } } as any) : undefined,
      },
    })) as PublicKeyCredential | null;
  } catch {
    // NotAllowedError covers both "user cancelled" and "timed out".
    return { ok: false, reason: "cancelled" };
  }

  if (!asserted) return { ok: false, reason: "cancelled" };

  if (!rec.prf) return { ok: true, refreshToken: rec.token };

  const prf = prfOutput(asserted);
  if (!prf || !rec.iv) return { ok: false, reason: "stale" };

  try {
    const key = await aesKeyFromPrf(prf);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64u(rec.iv) },
      key,
      fromB64u(rec.token)
    );
    return { ok: true, refreshToken: new TextDecoder().decode(plain) };
  } catch {
    return { ok: false, reason: "stale" };
  }
}
