"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setBusy(false); }
    else window.location.href = "/crm";
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="mo-card w-full max-w-sm space-y-4 p-8">
        <div className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-teal font-display text-xl font-bold text-white">M</span>
          <div>
            <h1 className="mo-h1 text-xl leading-none">Momentum</h1>
            <p className="text-xs text-slate">Operations CRM</p>
          </div>
        </div>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="Email"
          className="w-full rounded-xl border border-[color:var(--border)] bg-white/60 p-3 text-sm text-navy outline-none focus:border-teal dark:bg-white/10 dark:text-ice" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required placeholder="Password"
          className="w-full rounded-xl border border-[color:var(--border)] bg-white/60 p-3 text-sm text-navy outline-none focus:border-teal dark:bg-white/10 dark:text-ice" />
        <button disabled={busy} className="mo-primary w-full rounded-xl px-4 py-3 text-sm font-semibold shadow-card disabled:opacity-50">
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {error && <p className="text-sm text-red">{error}</p>}
      </form>
    </main>
  );
}
