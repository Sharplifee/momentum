"use client";

import { useEffect } from "react";

/**
 * Browser-side half of the append-only event log.
 *
 * Captures, for every visitor of the site / CRM / portal:
 *  - page views (initial + client-side navigation)
 *  - user actions: clicks on buttons, links and role=button elements, form submits
 *  - every fetch the page makes (status, duration, retries are visible as repeats)
 *  - unhandled errors and promise rejections
 *
 * Events are batched and posted to the Supabase `log_events` RPC with the anon
 * key (insert-only; the table is append-only at the DB level). A per-browser
 * device id and a per-tab session id let a whole visit be replayed.
 */

type Ev = Record<string, unknown>;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let queue: Ev[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let deviceId = "";
let sessionId = "";
let installed = false;

function id(): string {
  return (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/-/g, "");
}

function ids() {
  try {
    deviceId = localStorage.getItem("mlog_device") ?? "";
    if (!deviceId) { deviceId = id(); localStorage.setItem("mlog_device", deviceId); }
  } catch { deviceId = deviceId || id(); }
  try {
    sessionId = sessionStorage.getItem("mlog_session") ?? "";
    if (!sessionId) { sessionId = id(); sessionStorage.setItem("mlog_session", sessionId); }
  } catch { sessionId = sessionId || id(); }
}

function flush(useBeacon = false) {
  if (!queue.length || !SUPABASE_URL || !SUPABASE_KEY) { queue = []; return; }
  const batch = queue.splice(0, 50);
  const body = JSON.stringify({ p: batch });
  const url = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/log_events?apikey=${encodeURIComponent(SUPABASE_KEY)}`;
  if (useBeacon && navigator.sendBeacon) {
    // sendBeacon cannot set headers; the apikey query param authenticates PostgREST.
    navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    return;
  }
  const f = (window as any).__mlog_fetch as typeof fetch || fetch;
  f(url, { method: "POST", keepalive: true, headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: "return=minimal" }, body })
    .catch(() => { /* never surface logging failures to the user */ });
  if (queue.length) flush(useBeacon);
}

export function track(e: Ev) {
  if (!installed) return;
  queue.push({
    project: "momentum",
    surface: "web",
    env: process.env.NODE_ENV === "production" ? "production" : "development",
    device_id: deviceId,
    session_id: sessionId,
    client_ts: new Date().toISOString(),
    http_path: location.pathname,
    user_agent: navigator.userAgent.slice(0, 300),
    payload: {},
    ...e,
  });
  if (queue.length >= 20) flush();
  else if (!timer) timer = setTimeout(() => { timer = null; flush(); }, 1500);
}

function label(el: Element): string {
  const t = el as HTMLElement;
  return (t.getAttribute("aria-label") || t.getAttribute("data-track") || t.getAttribute("name") || t.id || (t.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80) || t.tagName.toLowerCase());
}

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  ids();

  // page views
  const pageview = (how: string) => track({ event_type: "action", name: "page.view", status: "ok", payload: { how, url: location.href.slice(0, 500), referrer: document.referrer.slice(0, 300) } });
  pageview("load");
  const push = history.pushState.bind(history);
  const replace = history.replaceState.bind(history);
  history.pushState = (...a) => { push(...a); setTimeout(() => pageview("push"), 0); };
  history.replaceState = (...a) => { replace(...a); setTimeout(() => pageview("replace"), 0); };
  window.addEventListener("popstate", () => pageview("pop"));

  // user actions
  document.addEventListener("click", (ev) => {
    const el = (ev.target as Element | null)?.closest?.("button, a, [role=button], input[type=submit], summary, [data-track]");
    if (!el) return;
    track({ event_type: "action", name: `click.${el.tagName.toLowerCase()}`, status: "ok",
      payload: { label: label(el), href: (el as HTMLAnchorElement).href ? String((el as HTMLAnchorElement).href).slice(0, 300) : undefined } });
  }, { capture: true, passive: true });
  document.addEventListener("submit", (ev) => {
    const form = ev.target as HTMLFormElement;
    track({ event_type: "action", name: "form.submit", status: "ok", payload: { label: label(form), action: (form.getAttribute("action") ?? "").slice(0, 300), fields: form.elements.length } });
  }, { capture: true });

  // fetches made by the page (server round-trips, retries show up as repeats)
  const realFetch = window.fetch.bind(window);
  (window as any).__mlog_fetch = realFetch;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("/rest/v1/rpc/log_events")) return realFetch(input, init);
    const started = Date.now();
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    try {
      const res = await realFetch(input, init);
      track({ event_type: "fetch", name: `fetch ${method} ${path(url)}`, status: res.ok ? "ok" : "fail", http_method: method, http_status: res.status, duration_ms: Date.now() - started, request_id: res.headers.get("x-request-id") });
      return res;
    } catch (err) {
      track({ event_type: "error", name: `fetch ${method} ${path(url)}`, status: "fail", http_method: method, duration_ms: Date.now() - started, error_code: "network", error_message: String((err as Error)?.message ?? err).slice(0, 500) });
      throw err;
    }
  };

  // errors
  window.addEventListener("error", (ev) => track({ event_type: "error", name: "window.error", status: "fail", error_code: "uncaught", error_message: String(ev.message).slice(0, 1000), payload: { source: ev.filename, line: ev.lineno, col: ev.colno } }));
  window.addEventListener("unhandledrejection", (ev) => track({ event_type: "error", name: "window.unhandledrejection", status: "fail", error_code: "unhandled_rejection", error_message: String((ev.reason as Error)?.message ?? ev.reason).slice(0, 1000) }));

  // make sure the tail of a visit is not lost
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(true); });
  window.addEventListener("pagehide", () => flush(true));
}

function path(url: string): string {
  try { const u = new URL(url, location.origin); return u.origin === location.origin ? u.pathname : u.host + u.pathname; } catch { return url.slice(0, 200); }
}

export default function EventLogClient() {
  useEffect(() => { install(); }, []);
  return null;
}
