"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

/**
 * Session handoff for the native crew app.
 *
 * The app signs into Supabase natively (its background GPS task needs its own
 * access token, outside any browser). The CRM authenticates with cookies via
 * @supabase/ssr, so a native token alone won't log the webview in. The app
 * loads this page with its tokens in the URL fragment — fragments are never
 * sent to the server or written to logs — and setSession writes the cookies
 * the rest of the CRM reads.
 */
export default function SessionHandoff() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");
      const next = hash.get("next") || "/crm";

      if (!access_token || !refresh_token) {
        setError("Missing session tokens.");
        return;
      }

      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const { error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (error) {
        setError(error.message);
        return;
      }

      window.history.replaceState(null, "", window.location.pathname);
      window.location.replace(next);
    })();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--page)]">
      <p className="text-sm text-slate">{error ?? "Signing you in…"}</p>
    </div>
  );
}
