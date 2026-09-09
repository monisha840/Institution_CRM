import { NextResponse } from "next/server";
import {
  listDailyRituals, upsertDailyRitual,
  logAudit, readAllData,
} from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/scale/daily-rituals?studentId=…&dateFrom=…&dateTo=…
//
// Parents: only their own child.
// Teachers / admin / principal / academic_director: any student they
//   have visibility on.
export async function GET(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });

  const url = new URL(req.url);
  const studentId = url.searchParams.get("studentId") || undefined;
  const dateFrom  = url.searchParams.get("dateFrom")  || undefined;
  const dateTo    = url.searchParams.get("dateTo")    || undefined;

  // Parent — force scoping to their linked child.
  if (session.role === "parent") {
    if (!session.linkedId) return NextResponse.json({ ok: true, items: [] });
    const items = await listDailyRituals({ studentId: session.linkedId, dateFrom, dateTo, limit: 60 });
    return NextResponse.json({ ok: true, items });
  }

  if (session.role === "teacher" && studentId) {
    // Verify the student is in their assigned classes.
    const data = await readAllData();
    const myClasses = new Set(Array.isArray(session.linkedClasses) ? session.linkedClasses : []);
    const stu = (data.addedStudents || []).find((s) => s.id === studentId);
    if (!stu || (myClasses.size > 0 && !myClasses.has(stu.cls))) {
      return NextResponse.json({ ok: false, error: "Student not in your class" }, { status: 403 });
    }
  }

  const items = await listDailyRituals({ studentId, dateFrom, dateTo, limit: 60 });
  return NextResponse.json({ ok: true, items });
}

// POST /api/scale/daily-rituals { studentId, ritualDate, q1Learned, q2DidWell, q3Tomorrow }
// Parents save for their child; admins/teachers can save for anyone.
export async function POST(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });

  let body; try { body = await req.json(); } catch { body = null; }
  if (!body) return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });

  // Resolve studentId for parents from session.
  let studentId = body.studentId;
  if (session.role === "parent") {
    if (!session.linkedId) return NextResponse.json({ ok: false, error: "No child linked" }, { status: 400 });
    studentId = session.linkedId;
  }
  if (!studentId) return NextResponse.json({ ok: false, error: "studentId required" }, { status: 400 });

  const ritualDate = body.ritualDate || new Date().toISOString().slice(0, 10);

  try {
    const ritual = await upsertDailyRitual({
      studentId, ritualDate,
      q1Learned: body.q1Learned, q2DidWell: body.q2DidWell, q3Tomorrow: body.q3Tomorrow,
      recordedBy: session.sub,
    });
    try {
      await logAudit(session.name || "User", "Recorded daily ritual", `${ritual.id} · ${ritualDate}`);
    } catch {}
    return NextResponse.json({ ok: true, ritual });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }
}
