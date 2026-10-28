import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { logEvent, newRequestId } from "@/lib/eventLog";

/**
 * Two jobs:
 *  1. Auth guard for /crm and /portal (unchanged behaviour).
 *  2. Append-only event log: every request to this deployment (pages, API,
 *     crons, webhooks) gets a `request` row with a request id that is also
 *     forwarded downstream as `x-request-id` so route handlers, outbound
 *     fetches and DB changes can be tied back to it.
 */
export async function middleware(req: NextRequest, event: NextFetchEvent) {
  const started = Date.now();
  const path = req.nextUrl.pathname;
  const requestId = req.headers.get("x-request-id") ?? newRequestId();

  // forward the request id to the handler / server components
  const fwdHeaders = new Headers(req.headers);
  fwdHeaders.set("x-request-id", requestId);
  const res = NextResponse.next({ request: { headers: fwdHeaders } });
  res.headers.set("x-request-id", requestId);

  let userId: string | null = null;
  const guarded = path.startsWith("/crm") || path.startsWith("/portal");
  if (guarded) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (name: string) => req.cookies.get(name)?.value,
          set: (name: string, value: string, options: CookieOptions) => {
            res.cookies.set({ name, value, ...options });
          },
          remove: (name: string, options: CookieOptions) => {
            res.cookies.set({ name, value: "", ...options });
          },
        },
      }
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  }

  const log = (status: string, extra: Record<string, unknown> = {}) =>
    event.waitUntil(
      logEvent({
        event_type: "request",
        name: `${req.method} ${path}`,
        status,
        surface: "edge",
        request_id: requestId,
        http_method: req.method,
        http_path: path,
        actor_type: userId ? "user" : path.startsWith("/api/cron/") ? "cron" : "anon",
        actor_id: userId,
        ip: req.ip ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        user_agent: req.headers.get("user-agent"),
        duration_ms: Date.now() - started,
        payload: { query: Object.fromEntries(req.nextUrl.searchParams), referer: req.headers.get("referer"), ...extra },
      })
    );

  if (!guarded) {
    log("ok");
    return res;
  }

  const isCrmLogin = path === "/crm/login";
  const isPortalLogin = path === "/portal/login";

  // The native app signs in against Supabase directly and hands its tokens to
  // /crm/session, which converts them into the cookie session the CRM reads.
  // That request necessarily arrives with no cookie yet, so the guard below
  // would bounce it to login and throw the tokens away — the app would hang on
  // a blank screen. Let it through; the page itself does nothing without valid
  // tokens in the URL fragment.
  if (path === "/crm/session") {
    log("ok", { note: "session handoff" });
    return res;
  }

  if (path.startsWith("/crm") && !isCrmLogin && !userId) {
    log("redirect", { to: "/crm/login", reason: "unauthenticated" });
    return NextResponse.redirect(new URL("/crm/login", req.url));
  }
  if (path.startsWith("/portal") && !isPortalLogin && !userId) {
    log("redirect", { to: "/portal/login", reason: "unauthenticated" });
    return NextResponse.redirect(new URL("/portal/login", req.url));
  }
  if (isCrmLogin && userId) {
    log("redirect", { to: "/crm", reason: "already signed in" });
    return NextResponse.redirect(new URL("/crm", req.url));
  }
  log("ok");
  return res;
}

export const config = {
  // everything except Next internals and static assets
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|css|js|map|woff2?|ttf)$).*)"],
};
