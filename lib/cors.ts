// lib/cors.ts — CORS for cross-origin form posts from the marketing site.
// The public site (Claude Design → its own Vercel project + the custom domain)
// posts the quote form to this app's /api/leads. Browsers require these headers.
// Anything not on this list is refused.

const ALLOWED_ORIGINS = [
  "https://momentumlandscapingut.com",
  "https://www.momentumlandscapingut.com",
];

// Any momentum-site preview/prod *.vercel.app deployment is also allowed.
const VERCEL_SITE_RE = /^https:\/\/momentum-site[a-z0-9-]*\.vercel\.app$/;

export function corsHeaders(origin: string | null): Record<string, string> {
  const ok =
    !!origin && (ALLOWED_ORIGINS.includes(origin) || VERCEL_SITE_RE.test(origin));
  if (!ok) return {};
  return {
    "Access-Control-Allow-Origin": origin!,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
