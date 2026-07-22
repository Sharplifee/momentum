"use client";

import { useEffect, useState } from "react";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

function readCookie(name: string): string | undefined {
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(name + "="))
    ?.split("=")[1];
}

export default function QuotePage() {
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [tracking, setTracking] = useState<{ fbclid?: string; fbp?: string; utm?: Record<string, string>; landing_page?: string; referrer?: string }>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    for (const k of ["source", "medium", "campaign", "content", "term"]) {
      const v = params.get(`utm_${k}`);
      if (v) utm[k] = v;
    }
    setTracking({
      fbclid: params.get("fbclid") ?? undefined,
      fbp: readCookie("_fbp"),
      utm: Object.keys(utm).length ? utm : undefined,
      landing_page: window.location.href,
      referrer: document.referrer || undefined,
    });
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    const form = new FormData(e.currentTarget);
    const payload = {
      full_name: String(form.get("full_name") ?? ""),
      phone: String(form.get("phone") ?? ""),
      email: String(form.get("email") ?? "") || undefined,
      address: String(form.get("address") ?? ""),
      city: String(form.get("city") ?? "") || undefined,
      service_interest: String(form.get("service_interest") ?? "") || undefined,
      requested_window: String(form.get("requested_window") ?? "") || undefined,
      company_website: String(form.get("company_website") ?? "") || undefined, // honeypot
      ...tracking,
    };
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong");
      // pixel-side Lead with matching event_id → dedupes against server CAPI event
      if (window.fbq && json.lead_id) {
        window.fbq("track", "Lead", {}, { eventID: json.lead_id });
      }
      setStatus("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <main className="mx-auto max-w-lg p-8 text-center">
        <h1 className="mb-4 text-3xl font-bold text-moss">You're all set 🌱</h1>
        <p className="text-stone-600">
          Wayne, our scheduling assistant, is texting you now to lock in your quote visit. Keep an
          eye on your phone!
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="mb-2 text-3xl font-bold text-moss">Get your free quote</h1>
      <p className="mb-6 text-stone-600">
        Tell us about your yard and we'll text you within minutes to set up a visit.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input name="full_name" required minLength={2} placeholder="Full name" className="rounded-lg border border-stone-300 p-3" />
        <input name="phone" required type="tel" placeholder="Mobile number" className="rounded-lg border border-stone-300 p-3" />
        <input name="email" type="email" placeholder="Email (optional)" className="rounded-lg border border-stone-300 p-3" />
        <input name="address" required placeholder="Street address" className="rounded-lg border border-stone-300 p-3" />
        <select name="city" required className="rounded-lg border border-stone-300 p-3" defaultValue="">
          <option value="" disabled>City</option>
          {["Lehi","Saratoga Springs","Eagle Mountain","American Fork","Pleasant Grove","Draper","Bluffdale","South Jordan","Riverton","Herriman"].map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select name="service_interest" className="rounded-lg border border-stone-300 p-3" defaultValue="">
          <option value="">What do you need?</option>
          <option value="weekly-mow">Weekly mowing ($45/visit)</option>
          <option value="biweekly-mow">Biweekly mowing ($55/visit)</option>
          <option value="aeration">Aeration ($89)</option>
          <option value="cleanup">Spring/Fall cleanup (quoted)</option>
          <option value="addons">Landscaping add-ons (quoted)</option>
        </select>
        <select name="requested_window" className="rounded-lg border border-stone-300 p-3" defaultValue="">
          <option value="">Preferred time window</option>
          <option value="mornings">Mornings</option>
          <option value="afternoons">Afternoons</option>
          <option value="flexible">Flexible</option>
        </select>
        {/* honeypot — hidden from humans */}
        <input name="company_website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
        <button
          type="submit"
          disabled={status === "sending"}
          className="rounded-lg bg-moss px-6 py-3 font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {status === "sending" ? "Sending…" : "Text me my quote"}
        </button>
        {status === "error" && <p className="text-sm text-red-600">{errorMsg}</p>}
        <p className="text-xs text-stone-400">
          By submitting you agree to receive texts from Momentum Landscaping (incl. our AI assistant
          Wayne). Msg&nbsp;&amp;&nbsp;data rates may apply. Reply STOP to opt out. See our{" "}
          <a href="/legal/sms-terms" className="underline">SMS Terms</a> and{" "}
          <a href="/legal/privacy" className="underline">Privacy Policy</a>.
        </p>
      </form>
    </main>
  );
}
