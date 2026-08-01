/**
 * Minimal Sentry reporter — posts exceptions via the envelope HTTP API so we
 * get error visibility without the full @sentry/nextjs SDK weight. Safe no-op
 * when SENTRY_DSN is unset.
 */
export async function reportError(err: unknown, context?: Record<string, unknown>) {
  const dsn = process.env.SENTRY_DSN;
  console.error("reportError", err, context);
  if (!dsn) return;
  try {
    const m = dsn.match(/^https:\/\/([a-f0-9]+)@([^/]+)\/(\d+)$/);
    if (!m) return;
    const [, publicKey, host, projectId] = m;
    const eventId = crypto.randomUUID().replace(/-/g, "");
    const timestamp = new Date().toISOString();
    const error = err instanceof Error ? err : new Error(String(err));
    const event = {
      event_id: eventId,
      timestamp,
      platform: "node",
      level: "error",
      environment: process.env.VERCEL_ENV ?? "development",
      exception: {
        values: [{ type: error.name, value: error.message, stacktrace: undefined }],
      },
      extra: { ...context, stack: error.stack },
    };
    const envelope =
      JSON.stringify({ event_id: eventId, sent_at: timestamp, dsn }) +
      "\n" +
      JSON.stringify({ type: "event" }) +
      "\n" +
      JSON.stringify(event);
    await fetch(`https://${host}/api/${projectId}/envelope/?sentry_key=${publicKey}&sentry_version=7`, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body: envelope,
    });
  } catch {
    // never let error reporting throw
  }
}
