import { NextResponse } from "next/server";
import { upsertDailyLog, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Roles allowed to post / edit daily academic logs. Parents are
// explicitly excluded — they can read their child's log via the academic
// tracker, but the log itself is the class teacher's record.
const WRITE_ROLES = new Set(["teacher", "principal", "academic_director", "admin"]);

export async function POST(req) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  }
  if (!WRITE_ROLES.has(session.role)) {
    return NextResponse.json(
      { ok: false, error: "Daily logs are written by the class teacher. Parents have read-only access." },
      { status: 403 }
    );
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.studentId || !body?.date) {
    return NextResponse.json({ ok: false, error: "studentId and date are required" }, { status: 400 });
  }
  try {
    const { fresh, log } = await upsertDailyLog({
      studentId: body.studentId,
      studentName: body.studentName || "",
      cls: body.cls || "",
      date: body.date,
      attendance: body.attendance || "present",
      leaveReason: body.leaveReason || null,
      classwork: (body.classwork || "").trim(),
      classworkStatus: body.classworkStatus || null,
      homework: (body.homework || "").trim(),
      homeworkStatus: body.homeworkStatus || null,
      subjectLogs: Array.isArray(body.subjectLogs) ? body.subjectLogs : undefined,
      topics: (body.topics || "").trim(),
      handwritingNote: (body.handwritingNote || "").trim(),
      handwritingGrade: (body.handwritingGrade || "").trim(),
      behaviour: (body.behaviour || "").trim(),
      extra: (body.extra || "").trim(),
      postedBy: body.postedBy || "Teacher",
    });
    try {
      await logAudit(
        log.postedBy || "Teacher",
        fresh ? "Posted daily log" : "Updated daily log",
        `${log.studentId} ${log.studentName} · ${log.date}`
      );
    } catch {}
    return NextResponse.json({ ok: true, log });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }
}
