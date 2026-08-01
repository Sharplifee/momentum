"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function PortalLogin() {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const res = await fetch("/api/portal/otp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }) });
    const json = await res.json();
    if (!res.ok) setError(json.message ?? json.error ?? "Something went wrong");
    else setStep("code");
    setBusy(false);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const res = await fetch("/api/portal/otp/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, code }) });
    const json = await res.json();
    if (!res.ok) { setError(json.error === "invalid_code" ? "That code didn't match — try again." : json.error); setBusy(false); return; }
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error: vErr } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: json.token_hash });
    if (vErr) { setError(vErr.message); setBusy(false); return; }
    window.location.href = "/portal";
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-3xl border border-white/15 bg-white/[0.08] p-8 text-center shadow-2xl backdrop-blur-xl sm:p-10">
      <h1 className="mb-1 text-3xl font-bold">Momentum <span className="text-teal">🌱</span></h1>
      <p className="mb-8 text-white/60">Your lawn, your schedule — sign in with your phone.</p>
      {step === "phone" ? (
        <form onSubmit={sendCode} className="space-y-4">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" required placeholder="Mobile number"
            className="w-full rounded-xl border border-white/20 bg-white/10 p-4 text-white placeholder-white/40 backdrop-blur" />
          <button disabled={busy} className="w-full rounded-xl bg-teal p-4 font-semibold disabled:opacity-50">{busy ? "Sending…" : "Text me a code"}</button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          <p className="text-sm text-white/60">We texted a 6-digit code to {phone}.</p>
          <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} required placeholder="6-digit code"
            className="w-full rounded-xl border border-white/20 bg-white/10 p-4 text-center text-2xl tracking-[0.5em] text-white backdrop-blur" />
          <button disabled={busy} className="w-full rounded-xl bg-teal p-4 font-semibold disabled:opacity-50">{busy ? "Checking…" : "Sign in"}</button>
          <button type="button" onClick={() => setStep("phone")} className="w-full text-sm text-white/50 underline">Different number</button>
        </form>
      )}
      {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
      </div>
    </main>
  );
}
