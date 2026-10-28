import { NextRequest, NextResponse } from "next/server";
import { withEventLog } from "@/lib/eventLog";

export const runtime = "nodejs";

/**
 * The assistant is Norma now. This path stays alive because the customer app
 * calls it from a separate repo, and renaming a route someone else depends on
 * without warning is how you break production on a Friday.
 *
 * Forwards to /api/nora. Remove once the customer app points at the new path.
 */
async function forward(req: NextRequest) {
  const url = new URL(req.url);
  const target = `${url.origin}/api/nora${url.search}`;
  const res = await fetch(target, {
    method: req.method,
    headers: req.headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.text(),
  });
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
}

const __GET = forward;
const __POST = forward;

export const GET = withEventLog("GET /api/wayne", __GET);
export const POST = withEventLog("POST /api/wayne", __POST);
