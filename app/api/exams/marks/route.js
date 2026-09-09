import { NextResponse } from "next/server";
import { saveMarks, listMarks, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const CAN_RECORD = new Set(["admin", "principal", "academic_director", "teacher"]);

// GET /api/exams/marks?examId=&studentId=
export async function GET(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const url = new URL(req.url);
  const examId = url.searchParams.get("examId") || undefined;
  const studentId = url.searchParams.get("studentId") || undefined;
  // Parents can only see their own child's marks. The shell already scopes
  // ADDED_STUDENTS for parents — re-scope here defensively.
  if (session.role === "parent" && session.linkedId && !studentId) {
    const marks = await listMarks({ studentId: session.linkedId });
    return NextResponse.json({ ok: true, marks });
  }
  return NextResponse.json({ ok: true, marks: await listMarks({ examId, studentId }) });
}

// POST /api/exams/marks { examId, studentId, studentName, score, remarks? }
// Or bulk: { examId, entries: [{ studentId, studentName, score, remarks? }, …] }
export async function POST(req) {
  const session = await getSession();
  if (!session || !CAN_RECORD.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.examId) return NextResponse.json({ ok: false, error: "examId required" }, { status: 400 });

  try {
    if (Array.isArray(body.entries)) {
      const out = [];
      for (const e of body.entries) {
        if (!e.studentId) continue;
        out.push(await saveMarks({
          examId: body.examId, studentId: e.studentId, studentName: e.studentName,
          score: e.score, remarks: e.remarks, recordedBy: session.name || session.email,
        }));
      }
      try { await logAudit(session.name || "Teacher", "Recorded marks (bulk)", `${body.examId} · ${out.length} students`); } catch {}
      return NextResponse.json({ ok: true, marks: out });
    }
    if (!body.studentId) return NextResponse.json({ ok: false, error: "studentId required" }, { status: 400 });
    const mark = await saveMarks({
      examId: body.examId, studentId: body.studentId, studentName: body.studentName,
      score: body.score, remarks: body.remarks, recordedBy: session.name || session.email,
    });
    try { await logAudit(session.name || "Teacher", "Recorded marks", `${body.examId} · ${mark.studentName} · ${mark.score}/${mark.maxMarks}`); } catch {}
    return NextResponse.json({ ok: true, mark });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}
