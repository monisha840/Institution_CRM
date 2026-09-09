import { NextResponse } from "next/server";
import {
  addScaleSession, listScaleSessions, addScaleEntries,
  logAudit, readAllData,
} from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Roles that can record SCALE sessions. Teachers are the primary
// authors; AD / principal / admin can also record (e.g. covering a
// class or auditing).
const WRITE_ROLES = new Set(["teacher", "academic_director", "principal", "admin", "fees_manager"]);

// GET /api/scale/sessions?cls=2-A&dateFrom=…&dateTo=…
export async function GET(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  const url = new URL(req.url);
  const cls       = url.searchParams.get("cls") || undefined;
  const dateFrom  = url.searchParams.get("dateFrom") || undefined;
  const dateTo    = url.searchParams.get("dateTo")   || undefined;
  const filters = { cls, dateFrom, dateTo, limit: 200 };
  if (session.role === "teacher") filters.teacherId = session.sub;
  if (session.role === "parent")  return NextResponse.json({ ok: true, items: [] });
  const items = await listScaleSessions(filters);
  return NextResponse.json({ ok: true, items });
}

// POST /api/scale/sessions
// Body: { cls, subject, sessionDate, sessionType, studentsPresent,
//         preChecklist, duringRatings, postRatings, workedWell,
//         toChange, signoff, notes, entries: [{studentId, indicatorKey, score, note?}] }
//
// Creates the session row + bulk-inserts the per-student entries in a
// single round-trip from the client.
export async function POST(req) {
  const session = await getSession();
  if (!session || !WRITE_ROLES.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Not authorised to record SCALE sessions" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.sessionDate) {
    return NextResponse.json({ ok: false, error: "sessionDate required" }, { status: 400 });
  }

  // Teachers may only record for classes they're assigned to.
  if (session.role === "teacher" && body.cls) {
    const myClasses = new Set(Array.isArray(session.linkedClasses) ? session.linkedClasses : []);
    if (myClasses.size > 0 && !myClasses.has(body.cls)) {
      return NextResponse.json({ ok: false, error: `Class ${body.cls} is not assigned to you` }, { status: 403 });
    }
  }

  let saved;
  try {
    saved = await addScaleSession({
      teacherId:       session.sub,
      cls:             body.cls || null,
      subject:         body.subject || null,
      sessionDate:     body.sessionDate,
      sessionType:     body.sessionType || "regular",
      studentsPresent: body.studentsPresent || 0,
      preChecklist:    body.preChecklist  || {},
      duringRatings:   body.duringRatings || {},
      postRatings:     body.postRatings   || {},
      workedWell:      body.workedWell || null,
      toChange:        body.toChange   || null,
      signoff:         body.signoff || {},
      notes:           body.notes || null,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }

  // Validate entries belong to real students; ignore unknowns silently
  // rather than failing the whole session save.
  let entries = [];
  if (Array.isArray(body.entries) && body.entries.length > 0) {
    let knownIds = null;
    try {
      const data = await readAllData();
      knownIds = new Set((data.addedStudents || []).map((s) => s.id));
    } catch {}
    const filtered = knownIds
      ? body.entries.filter((e) => knownIds.has(e.studentId))
      : body.entries;
    try {
      entries = await addScaleEntries(saved.id, filtered);
    } catch (e) {
      console.warn(`[scale] entry write failed: ${e.message}`);
    }
  }

  try {
    await logAudit(
      session.name || session.email || "User",
      "Recorded SCALE session",
      `${saved.id} · ${saved.cls || "—"} · ${entries.length} entries · ${saved.studentsPresent || 0} students`
    );
  } catch {}

  return NextResponse.json({ ok: true, session: saved, entries });
}
