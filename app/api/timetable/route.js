import { NextResponse } from "next/server";
import { setTimetableEntry, removeTimetableEntry, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

const STAFF = new Set(["admin", "principal", "academic_director"]);

// POST /api/timetable
//   { cls, day, period, subject, teacherId?, teacherName?, room? }
// Upsert one slot of a class's weekly timetable.
export async function POST(req) {
  const session = await getSession();
  if (!session || !STAFF.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  try {
    const entry = await setTimetableEntry(body || {});
    try { await logAudit(session.name || "Director", "Updated timetable", `${entry.cls} · ${entry.day} P${entry.period} · ${entry.subject}`); } catch {}
    return NextResponse.json({ ok: true, entry });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }
}

// DELETE /api/timetable { id }
export async function DELETE(req) {
  const session = await getSession();
  if (!session || !STAFF.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  const removed = await removeTimetableEntry(body.id);
  if (!removed) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  try { await logAudit(session.name || "Director", "Cleared timetable slot", removed.id); } catch {}
  return NextResponse.json({ ok: true });
}
