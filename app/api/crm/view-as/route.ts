import { NextRequest, NextResponse } from "next/server";
import { staffFromSession } from "@/lib/apiAuth";
import { VIEW_AS_COOKIE, CAN_PREVIEW } from "@/lib/crm";

export const runtime = "nodejs";

/**
 * Turn the crew view on or off for an admin.
 *
 * Clearing is always allowed, whoever asks — nobody should ever be stuck in a
 * preview. Setting requires owner or manager, and "crew" is the only value
 * accepted, so this cannot be used to assume some other role.
 */
export async function POST(req: NextRequest) {
  const { view } = await req.json().catch(() => ({}));

  if (view === null || view === undefined || view === "") {
    const res = NextResponse.json({ ok: true, previewing: false });
    res.cookies.set(VIEW_AS_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }

  const staff = await staffFromSession(CAN_PREVIEW);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (view !== "crew") return NextResponse.json({ error: "unsupported view" }, { status: 400 });

  const res = NextResponse.json({ ok: true, previewing: true });
  res.cookies.set(VIEW_AS_COOKIE, "crew", {
    path: "/", httpOnly: true, sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 8,   // a working day, then it lapses on its own
  });
  return res;
}
