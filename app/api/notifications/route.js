import { NextResponse } from "next/server";
import {
  listNotifications, markNotificationRead, markAllNotificationsRead,
} from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/notifications?unreadOnly=1 — fetches the signed-in user's
// notification stream. Used by the topbar bell to populate the badge
// and the popover list.
export async function GET(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get("unreadOnly") === "1";
  const items = await listNotifications(session.sub, { unreadOnly, limit: 50 });
  const unread = items.filter((n) => !n.isRead).length;
  return NextResponse.json({ ok: true, items, unread });
}

// PATCH /api/notifications { id?, all? } — mark one or all as read.
export async function PATCH(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  let body; try { body = await req.json(); } catch { body = null; }
  if (body?.all) {
    const touched = await markAllNotificationsRead(session.sub);
    return NextResponse.json({ ok: true, marked: touched });
  }
  if (!body?.id) return NextResponse.json({ ok: false, error: "id or all required" }, { status: 400 });
  const updated = await markNotificationRead(body.id, session.sub);
  if (!updated) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, notification: updated });
}
