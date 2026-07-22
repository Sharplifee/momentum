"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Stop = { id: string; status: string; arrival_at: string | null; departure_at: string | null; notes: string | null; weather_flag: boolean; properties: { address: string; city: string | null; gate_code: string | null; pets: string | null; access_notes: string | null } | null; services: { name: string } | null; customers: { full_name: string } | null };

const QUEUE_KEY = "momentum_offline_queue";

export function TodayStops({ jobs }: { jobs: Stop[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [queued, setQueued] = useState(0);

  // offline queue replay (3.8)
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

  async function uploadPhoto(jobId: string, file: File) {
    setBusy(jobId + "-photo");
    // client-side compress via canvas
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

  return (
    <div className="space-y-3">
      {queued > 0 && <div className="rounded-lg bg-gold/10 p-2 text-sm ">📶 {queued} update(s) queued offline — will retry automatically.</div>}
      {jobs.map((j, i) => (
        <div key={j.id} className={`mo-card p-4 ${j.weather_flag ? "border border-gold/50" : ""}`}>
          <div className="mb-1 flex items-center justify-between">
            <span className="font-semibold">{i + 1}. {j.customers?.full_name ?? "Customer"}</span>
            <span className="text-xs text-slate">{j.status}{j.weather_flag ? " ☔" : ""}</span>
          </div>
          <p className="text-sm text-slate">{j.properties?.address}, {j.properties?.city} · {j.services?.name}</p>
          {(j.properties?.gate_code || j.properties?.pets || j.properties?.access_notes) && (
            <p className="mt-1 text-xs text-slate">{[j.properties?.gate_code && `gate ${j.properties.gate_code}`, j.properties?.pets && `pets: ${j.properties.pets}`, j.properties?.access_notes].filter(Boolean).join(" · ")}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {!j.arrival_at && (
              <button disabled={busy === j.id} onClick={() => fire("/api/crm/clock", { job_id: j.id, event: "arrived" }, j.id)}
                className="rounded-xl bg-teal px-6 py-4 text-base font-semibold text-white shadow-card">☀︎ Clock in</button>
            )}
            {j.arrival_at && !j.departure_at && (
              <button disabled={busy === j.id} onClick={() => fire("/api/crm/clock", { job_id: j.id, event: "departed" }, j.id)}
                className="rounded-xl bg-gold px-6 py-4 text-base font-semibold text-navy shadow-card">✓ Clock out</button>
            )}
            <button disabled={busy === j.id} onClick={() => { const note = prompt("What's the issue?"); if (note) fire("/api/crm/clock", { job_id: j.id, event: "exception", note }, j.id); }}
              className="rounded-lg bg-ice/20 px-4 py-2 text-sm dark:bg-white/10">Report issue</button>
            <label className="cursor-pointer rounded-lg bg-ice/20 px-4 py-2 text-sm dark:bg-white/10">
              {busy === j.id + "-photo" ? "Uploading…" : "📷 Photo"}
              <input type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadPhoto(j.id, e.target.files[0])} />
            </label>
          </div>
        </div>
      ))}
      {!jobs.length && <p className="text-slate/70">No stops today. 🌤</p>}
    </div>
  );
}
