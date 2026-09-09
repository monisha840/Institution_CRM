import { NextResponse } from "next/server";
import { listSchools, addSchool, updateSchool, archiveSchool, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  const schools = await listSchools();
  return NextResponse.json({ ok: true, schools });
}

export async function POST(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ ok: false, error: "Only admin" }, { status: 403 });
  let body; try { body = await req.json(); } catch { body = null; }
  try {
    const school = await addSchool(body || {});
    try { await logAudit(session.name || "Admin", "Added school", `${school.id} · ${school.name}`); } catch {}
    return NextResponse.json({ ok: true, school });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }
}

export async function PATCH(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ ok: false, error: "Only admin" }, { status: 403 });
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  try {
    const school = await updateSchool(body.id, body);
    if (!school) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    try { await logAudit(session.name || "Admin", "Updated school", `${school.id} · ${school.name}`); } catch {}
    return NextResponse.json({ ok: true, school });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }
}

export async function DELETE(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ ok: false, error: "Only admin" }, { status: 403 });
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  const removed = await archiveSchool(body.id);
  if (!removed) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  try { await logAudit(session.name || "Admin", "Archived school", `${removed.id} · ${removed.name}`); } catch {}
  return NextResponse.json({ ok: true });
}
