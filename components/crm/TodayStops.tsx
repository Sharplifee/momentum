"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Stop = {
  id: string; status: string; arrival_at: string | null; departure_at: string | null;
  notes: string | null; weather_flag: boolean;
  properties: {
    address: string; city: string | null; gate_code: string | null; pets: string | null;
    access_notes: string | null; gate_width_in: number | null; has_dog: boolean | null;
    obstacles: string[] | null; lat?: number | null; lng?: number | null;
  } | null;
  services: { name: string } | null;
  customers: { full_name: string } | null;
};

const QUEUE_KEY = "momentum_offline_queue";
const MIN_GATE_IN = 30; // system_config.equipment.min_gate_width_in

/**
 * The crew's day.
 *
 * This was a flat list where every stop showed six buttons at once, so the
 * screen asked "which of these forty things?" instead of "what now?". A crew
 * member is holding a phone in one hand with the mower still running.
 *
 * Now there is one stop in front of you at a time, the rest collapsed behind
 * it. The three exception buttons live behind a single disclosure, because
 * they are the rare case and were competing with the action you actually came
 * to press.
 */
export function TodayStops({ jobs }: { jobs: Stop[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [queued, setQueued] = useState(0);
  const [showTrouble, setShowTrouble] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // ── offline queue replay — carried over unchanged ──────────────
  useEffect(() => {
    const replay = async () => {
      const q: any[] = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
      if (!q.length) return setQueued(0);
      const remaining: any[] = [];
      for (const item of q) {
        try {
          const res = await fetch(item.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.body) });
          if (!res.ok) remaining.push(item);
        } catch { remaining.push(item); }
      }
      localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
      setQueued(remaining.length);
      if (remaining.length < q.length) router.refresh();
    };
    replay();
    window.addEventListener("online", replay);
    return () => window.removeEventListener("online", replay);
  }, [router]);

  // Live on-site timer. Ticks once a minute — a second hand on a lawn is noise.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  async function fire(url: string, body: unknown, jobId: string) {
    setBusy(jobId);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("failed");
      router.refresh();
    } catch {
      const q = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
      q.push({ url, body });
      localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
      setQueued(q.length);
    }
    setBusy("");
  }

  // ── photo compression — carried over unchanged ────────────────
  async function uploadPhoto(jobId: string, file: File) {
    setBusy(jobId + "-photo");
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    await new Promise((r) => (img.onload = r));
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1280 / img.width);
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), "image/jpeg", 0.75));
    const form = new FormData();
    form.append("job_id", jobId);
    form.append("photo", blob, "photo.jpg");
    try {
      await fetch("/api/crm/photos", { method: "POST", body: form });
      router.refresh();
    } catch { /* photo uploads don't queue offline (too large for localStorage) */ }
    setBusy("");
  }

  const { active, upcoming, done } = useMemo(() => {
    const done = jobs.filter((j) => j.departure_at);
    const open = jobs.filter((j) => !j.departure_at);
    // The stop being worked is whichever is clocked in; otherwise the next one.
    const idx = Math.max(0, open.findIndex((j) => j.arrival_at));
    return { active: open[idx] ?? null, upcoming: open.filter((_, i) => i !== idx), done };
  }, [jobs]);

  const nav = (p: Stop["properties"]) =>
    p?.lat && p?.lng
      ? `https://maps.apple.com/?daddr=${p.lat},${p.lng}`
      : `https://maps.apple.com/?daddr=${encodeURIComponent([p?.address, p?.city, "UT"].filter(Boolean).join(", "))}`;

  const facts = (p: Stop["properties"]) =>
    [p?.gate_code && `Gate ${p.gate_code}`, p?.has_dog && "🐕 Dog on property",
     p?.pets && `Pets: ${p.pets}`, p?.access_notes,
     (p?.obstacles ?? []).length ? `Obstacles: ${p!.obstacles!.join(", ")}` : null]
    .filter(Boolean) as string[];

  if (!jobs.length) {
    return (
      <div className="mo-card p-8 text-center">
        <p className="text-lg">Nothing on today.</p>
        <p className="mt-1 text-sm text-slate">Enjoy it. 🌤</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {queued > 0 && (
        <div className="rounded-xl bg-gold/10 p-3 text-sm">
          📶 {queued} update{queued > 1 ? "s" : ""} saved — they&apos;ll send themselves when you&apos;re back on signal.
        </div>
      )}

      <div className="flex items-baseline gap-2 px-1">
        <span className="font-display text-2xl">{done.length}</span>
        <span className="text-sm text-slate">of {jobs.length} done</span>
        <div className="ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-ice/25">
          <div className="h-full rounded-full bg-teal transition-all"
               style={{ width: `${Math.round((done.length / jobs.length) * 100)}%` }} />
        </div>
      </div>

      {/* ── the stop you're on ─────────────────────────────────── */}
      {active && (() => {
        const p = active.properties;
        const gateBlocked = p?.gate_width_in != null && p.gate_width_in < MIN_GATE_IN;
        const onSite = active.arrival_at
          ? Math.max(0, Math.round((now - new Date(active.arrival_at).getTime()) / 60000)) : null;
        return (
          <div className={`mo-card p-5 ${gateBlocked ? "border border-red/60" : active.weather_flag ? "border border-gold/50" : "border border-teal/40"}`}>
            <div className="mb-1 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-teal">
                  {active.arrival_at ? "On site" : "Next stop"}
                </div>
                <div className="font-display text-2xl leading-tight">{active.customers?.full_name ?? "Customer"}</div>
                <p className="mt-0.5 text-sm text-slate">
                  {p?.address}{p?.city ? `, ${p.city}` : ""} · {active.services?.name}
                </p>
              </div>
              {onSite !== null && (
                <div className="shrink-0 text-right">
                  <div className="font-display text-2xl leading-none">{onSite}</div>
                  <div className="text-[11px] text-slate">min</div>
                </div>
              )}
            </div>

            {gateBlocked && (
              <p className="mt-3 rounded-lg bg-red/10 px-3 py-2 text-sm font-semibold text-red">
                🔒 Gate is {p?.gate_width_in} in — the mower needs {MIN_GATE_IN}. Bring the push mower or call ahead.
              </p>
            )}
            {active.weather_flag && (
              <p className="mt-2 rounded-lg bg-gold/10 px-3 py-2 text-sm">☔ Weather flagged for this stop.</p>
            )}

            {facts(p).length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-slate">
                {facts(p).map((f, i) => <li key={i}>· {f}</li>)}
              </ul>
            )}

            <div className="mt-4 grid gap-2">
              {!active.arrival_at ? (
                <>
                  <a href={nav(p)} target="_blank" rel="noreferrer"
                     className="grid min-h-[52px] place-items-center rounded-xl bg-ice/20 text-base font-semibold dark:bg-white/10">
                    ➤ Drive here
                  </a>
                  <button disabled={busy === active.id}
                    onClick={() => fire("/api/crm/clock", { job_id: active.id, event: "arrived" }, active.id)}
                    className="grid min-h-[56px] place-items-center rounded-xl bg-teal text-lg font-semibold text-white shadow-card disabled:opacity-60">
                    ☀︎ Start job
                  </button>
                </>
              ) : (
                <>
                  <label className="grid min-h-[52px] cursor-pointer place-items-center rounded-xl bg-ice/20 text-base font-semibold dark:bg-white/10">
                    {busy === active.id + "-photo" ? "Uploading…" : "📷 Add a photo"}
                    <input type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={(e) => e.target.files?.[0] && uploadPhoto(active.id, e.target.files[0])} />
                  </label>
                  <button disabled={busy === active.id}
                    onClick={() => fire("/api/crm/clock", { job_id: active.id, event: "departed" }, active.id)}
                    className="grid min-h-[56px] place-items-center rounded-xl bg-gold text-lg font-semibold text-navy shadow-card disabled:opacity-60">
                    ✓ Finish job
                  </button>
                </>
              )}
            </div>

            {/* Exceptions are rare and were competing with the button you came to press. */}
            <button onClick={() => setShowTrouble(showTrouble === active.id ? null : active.id)}
              className="mt-3 min-h-[44px] w-full text-sm text-slate underline decoration-ice/40 underline-offset-4">
              Something&apos;s wrong here
            </button>
            {showTrouble === active.id && (
              <div className="mt-2 grid gap-2">
                <button disabled={busy === active.id}
                  onClick={() => { const n = prompt("What's not ready? (optional)") ?? ""; fire("/api/crm/clock", { job_id: active.id, event: "yard_not_ready", note: n || null }, active.id); }}
                  className="min-h-[44px] rounded-lg bg-ice/20 px-4 text-sm dark:bg-white/10">🌱 Yard not ready</button>
                <button disabled={busy === active.id}
                  onClick={() => { const n = prompt("What's blocking access? (optional)") ?? ""; fire("/api/crm/clock", { job_id: active.id, event: "access_blocked", note: n || null }, active.id); }}
                  className="min-h-[44px] rounded-lg bg-ice/20 px-4 text-sm dark:bg-white/10">🔒 Access blocked</button>
                <button disabled={busy === active.id}
                  onClick={() => { const n = prompt("What's the issue?"); if (n) fire("/api/crm/clock", { job_id: active.id, event: "exception", note: n }, active.id); }}
                  className="min-h-[44px] rounded-lg bg-ice/20 px-4 text-sm dark:bg-white/10">⚠️ Other issue</button>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── still to come ─────────────────────────────────────── */}
      {upcoming.length > 0 && (
        <div className="mo-card divide-y divide-[color:var(--border)] p-0">
          <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate">
            Still to come · {upcoming.length}
          </div>
          {upcoming.map((j, i) => (
            <div key={j.id} className="flex items-center gap-3 px-4 py-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ice/25 text-xs font-semibold">
                {done.length + i + 2}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{j.customers?.full_name ?? "Customer"}</div>
                <div className="truncate text-xs text-slate">{j.properties?.address}</div>
              </div>
              {j.properties?.gate_width_in != null && j.properties.gate_width_in < MIN_GATE_IN && <span title="Narrow gate">🔒</span>}
              {j.properties?.has_dog && <span title="Dog on property">🐕</span>}
              {j.weather_flag && <span title="Weather flagged">☔</span>}
            </div>
          ))}
        </div>
      )}

      {/* ── finished ──────────────────────────────────────────── */}
      {done.length > 0 && (
        <div className="mo-card divide-y divide-[color:var(--border)] p-0 opacity-70">
          <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate">
            Done · {done.length}
          </div>
          {done.map((j) => (
            <div key={j.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-teal">✓</span>
              <div className="min-w-0 flex-1 truncate text-sm">{j.customers?.full_name ?? "Customer"}</div>
              <span className="text-xs text-slate">
                {j.arrival_at && j.departure_at
                  ? `${Math.max(1, Math.round((new Date(j.departure_at).getTime() - new Date(j.arrival_at).getTime()) / 60000))} min`
                  : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
