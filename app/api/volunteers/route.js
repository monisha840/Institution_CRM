import { NextResponse } from "next/server";
import { listVolunteers, addVolunteer, logVolunteerHours, removeVolunteer, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const CAN_MANAGE = new Set(["admin", "principal"]);

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, volunteers: await listVolunteers() });
}

export async function POST(req) {
  const session = await getSession();
  if (!session || !CAN_MANAGE.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  try {
    const v = await addVolunteer(body);
    try { await logAudit(session.name || "User", "Added volunteer", `${v.id} · ${v.name}`); } catch {}
    return NextResponse.json({ ok: true, volunteer: v });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}

// PATCH /api/volunteers  { id, hours, activity?, date? }  → log hours
export async function PATCH(req) {
  const session = await getSession();
  if (!session || !CAN_MANAGE.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id || !body?.hours) return NextResponse.json({ ok: false, error: "id + hours required" }, { status: 400 });
  try {
    const v = await logVolunteerHours(body.id, body);
    try { await logAudit(session.name || "User", "Logged volunteer hours", `${v.id} · +${body.hours}h · ${body.activity || ""}`); } catch {}
    return NextResponse.json({ ok: true, volunteer: v });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}

export async function DELETE(req) {
  const session = await getSession();
  if (!session || !CAN_MANAGE.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  const removed = await removeVolunteer(body.id);
  if (!removed) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  try { await logAudit(session.name || "User", "Removed volunteer", `${removed.id}`); } catch {}
  return NextResponse.json({ ok: true });
}
