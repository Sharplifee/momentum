"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Glacier switch, 44×26, the one every settings row in the design uses. */
export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative h-[26px] w-[44px] shrink-0 rounded-full transition disabled:opacity-50 ${on ? "bg-teal" : "bg-white/15"}`}>
      <span className={`absolute top-[3px] h-5 w-5 rounded-full transition ${on ? "left-[21px] bg-[#0a0a0a]" : "left-[3px] bg-[color:var(--ink)]"}`} />
    </button>
  );
}

type SaveResult = { ok: true; result?: any } | { ok: false; error: string };

/**
 * One call for every settings write. Posts `{kind, payload}` to the settings
 * API, refreshes the server page so the lists re-read from the database, and
 * keeps a short status line the screen can show. Errors are the API's words.
 */
export function useSettingsSave() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const save = useCallback(async (kind: string, payload: unknown): Promise<SaveResult> => {
    setBusy(true);
    let out: SaveResult;
    try {
      const res = await fetch("/api/crm/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, payload }) });
      const j = await res.json().catch(() => ({}));
      out = res.ok ? { ok: true, result: j.result } : { ok: false, error: j.error ?? `Save failed (${res.status})` };
    } catch (e) {
      out = { ok: false, error: "No connection — nothing was saved." };
    }
    setBusy(false);
    setMsg(out.ok ? { text: "Saved.", bad: false } : { text: out.error, bad: true });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), out.ok ? 2000 : 6000);
    if (out.ok) router.refresh();
    return out;
  }, [router]);

  return { save, busy, msg };
}

/** The status line under the title. Renders nothing when there is nothing to say. */
export function SaveStatus({ msg }: { msg: { text: string; bad: boolean } | null }) {
  if (!msg) return null;
  return <p role="status" className={`mb-3 text-[13px] ${msg.bad ? "text-coral" : "text-sage"}`}>{msg.text}</p>;
}
