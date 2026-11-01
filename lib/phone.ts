/**
 * Normalize a US phone number to E.164 (+1XXXXXXXXXX).
 * Returns null if it can't be confidently normalized.
 */
export function toE164(raw: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.startsWith("+") && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

/**
 * `customers.phone` is NOT NULL + UNIQUE, so a client whose number we do not
 * have yet carries the marker `unknown:<name-slug>` instead of a made-up
 * number (NO-FAKE-DATA.md § "Unknown phone"). Everything that dials, texts,
 * displays or hashes a phone goes through these two helpers so the marker is
 * treated exactly like a blank and never leaks as if it were a number.
 */
export const UNKNOWN_PHONE_PREFIX = "unknown:";

export function isRealPhone(p: unknown): p is string {
  return typeof p === "string" && /^\+1\d{10}$/.test(p);
}

/** The number when we have one, otherwise null (marker, empty, malformed). */
export function knownPhone(p: string | null | undefined): string | null {
  return isRealPhone(p) ? p : null;
}
