/**
 * Nora's opening text on a fresh lead.
 *
 * The old path rendered one row out of sms_templates, so every person on the
 * list got a byte-identical message. That reads as a blast, and a blast gets
 * ignored — which is exactly the no-show problem this text exists to kill.
 *
 * So: assemble the message from varied fragments, seeded off the lead id. Same
 * lead always produces the same text (a retry is not a second, different text),
 * different leads read differently.
 *
 * Every variant does the same three jobs — identify Nora and Momentum, read
 * back what the person actually picked, and end on a question that is cheap to
 * answer. The read-back is the whole point: a confirmed slot does not no-show.
 *
 * AI disclosure and STOP stay in every variant. Both are compliance surface,
 * not copy, so they are not part of the randomisation.
 */

export type OpenerInput = {
  firstName: string;
  /** e.g. "2 PM – 4 PM" straight off the quote form */
  window?: string | null;
  /** e.g. ["Wednesday","Thursday"] — days the person ticked */
  days?: string[] | null;
  /** availability fallback when the person ticked nothing */
  fallbackDays?: string[] | null;
  /** lead uuid — seeds variant choice so the same lead is stable across retries */
  seed: string;
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pick<T>(arr: T[], seed: number, salt: number): T {
  return arr[(seed + salt) % arr.length];
}

/** "2 PM – 4 PM" -> "2 to 4pm"; leaves anything unrecognised alone. */
export function humanizeWindow(w?: string | null): string | null {
  if (!w) return null;
  const m = w.match(/(\d{1,2})\s*(AM|PM)?\s*[–\-—to]+\s*(\d{1,2})\s*(AM|PM)/i);
  if (!m) return w.trim() || null;
  const [, a, aMer, b, bMer] = m;
  const end = `${b}${bMer.toLowerCase()}`;
  // drop the meridiem on the start time when both sides share it — "2 to 4pm"
  const start = !aMer || aMer.toLowerCase() === bMer.toLowerCase() ? a : `${a}${aMer.toLowerCase()}`;
  return `${start} to ${end}`;
}

/** ["Wed","Thu","Sat"] -> "Wednesday, Thursday or Saturday" */
export function humanizeDays(days?: string[] | null, conj = "or"): string | null {
  const d = (days ?? []).map((x) => x.trim()).filter(Boolean);
  if (d.length === 0) return null;
  if (d.length === 1) return d[0];
  if (d.length === 2) return `${d[0]} ${conj} ${d[1]}`;
  if (d.length >= 6) return OPEN_WEEK;
  return `${d.slice(0, -1).join(", ")} ${conj} ${d[d.length - 1]}`;
}

/** Sentinel for "they ticked basically the whole week" — phrased differently downstream. */
export const OPEN_WEEK = "__OPEN_WEEK__";

const INTROS = [
  (n: string) => `Hi ${n} — Nora here, Momentum Landscaping's AI assistant.`,
  (n: string) => `Hey ${n}, this is Nora, the AI assistant over at Momentum Landscaping.`,
  (n: string) => `${n} — it's Nora from Momentum Landscaping (their AI assistant).`,
  (n: string) => `Hi ${n}, Nora with Momentum Landscaping here — I'm their AI assistant.`,
  (n: string) => `Hey ${n} — Nora from Momentum Landscaping, their AI assistant.`,
];

/** exactly two options — "either" is only correct here */
const TWO_ASKS = [
  "does that work for you?",
  "would either of those work?",
  "can I lock one of those in?",
  "which of those is easier?",
];

/** three or more options */
const MANY_ASKS = [
  "do any of those work for you?",
  "which of those is easiest?",
  "can I lock one of those in?",
  "any of those good on your end?",
];

const SINGLE_ASKS = [
  "does that work for you?",
  "is that good on your end?",
  "can I lock that in?",
  "shall I put you down for that?",
];

const NO_PREF_ASKS = [
  "What day and time suits you best for a quick walk-through?",
  "When's a good window for a quick look at the yard?",
  "What day works best for a short visit?",
];

/**
 * Builds the opener. Never returns an empty string — if the person gave us
 * neither a window nor a day we still ask a real question.
 */
export function composeNoraOpener(input: OpenerInput): string {
  const seed = hash(input.seed);
  const name = (input.firstName || "there").trim();
  const intro = pick(INTROS, seed, 0)(name);

  const win = humanizeWindow(input.window);
  const chosen = (input.days ?? []).filter(Boolean);
  const days = humanizeDays(chosen.length ? chosen : input.fallbackDays);
  const optionCount = chosen.length || (input.fallbackDays ?? []).length;
  const askPool = optionCount >= 3 ? MANY_ASKS : optionCount === 2 ? TWO_ASKS : SINGLE_ASKS;

  let middle: string;
  if (win && days === OPEN_WEEK) {
    middle = `${win} works on your end most days by the look of it \u2014 which day should I pencil in?`;
  } else if (days === OPEN_WEEK) {
    middle = "Looks like most days work for you \u2014 what day and time should I pencil in?";
  } else if (win && days) {
    middle = `${win} on ${days}, ${pick(askPool, seed, 3)}`;
  } else if (win) {
    middle = `I've got you down for ${win} — what day this week works for a quick visit?`;
  } else if (days) {
    middle = `I've got ${days} down for you — what time of day is easiest?`;
  } else {
    middle = pick(NO_PREF_ASKS, seed, 5);
  }

  return `${intro} ${middle} Reply STOP to opt out.`;
}
