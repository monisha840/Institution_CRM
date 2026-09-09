import { NextResponse } from "next/server";
import { getPeriodicGrid, savePeriodicMarks, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Class teachers (and academic staff) record the four periodic tests (I–IV)
// subject-wise for their class. Backed by the exams/exam_marks model.
const CAN_EDIT = new Set(["admin", "principal", "academic_director", "teacher"]);

// GET /api/exams/periodic?cls=5-A&test=periodic_1
// Loads the grid: subjects (columns), students (rows), current marks, max.
export async function GET(req) {
  const session = await getSession();
  if (!session || !CAN_EDIT.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }
  const url = new URL(req.url);
  const cls = url.searchParams.get("cls");
  const test = url.searchParams.get("test") || "periodic_1";
  if (!cls) return NextResponse.json({ ok: false, error: "cls required" }, { status: 400 });
  try {
    const grid = await getPeriodicGrid({ cls, test });
    return NextResponse.json({ ok: true, ...grid });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }
}

// POST /api/exams/periodic
//   { cls, test, maxMarks, entries: [{ studentId, studentName, subject, score }] }
export async function POST(req) {
  const session = await getSession();
  if (!session || !CAN_EDIT.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }
  const actor = session.name || "Teacher";
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.cls || !Array.isArray(body?.entries)) {
    return NextResponse.json({ ok: false, error: "cls and entries required" }, { status: 400 });
  }
  try {
    const result = await savePeriodicMarks({
      cls: body.cls,
      test: body.test,
      maxMarks: body.maxMarks,
      entries: body.entries,
      actor,
    });
    try { await logAudit(actor, "Saved periodic test marks", `${body.cls} · ${body.test} · ${result.saved} marks`); } catch {}
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }
}
