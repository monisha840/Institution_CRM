import { NextResponse } from "next/server";
import { addExam, listExams, removeExam, logAudit, addBroadcast, readAllData, __EXAM_META } from "@/lib/db";
import { supabase, supabaseEnabled, fromStudent } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const CAN_CREATE = new Set(["admin", "principal", "academic_director", "teacher"]);

export async function GET(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const url = new URL(req.url);
  return NextResponse.json({
    ok: true,
    exams: await listExams({
      cls: url.searchParams.get("cls") || undefined,
      subject: url.searchParams.get("subject") || undefined,
    }),
    meta: __EXAM_META,
  });
}

export async function POST(req) {
  const session = await getSession();
  if (!session || !CAN_CREATE.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.name || !body?.cls || !body?.subject) {
    return NextResponse.json({ ok: false, error: "name, cls, subject required" }, { status: 400 });
  }
  try {
    const exam = await addExam({ ...body, createdBy: session.name || session.email });
    try { await logAudit(session.name || "User", "Created exam", `${exam.id} · ${exam.cls} · ${exam.subject} · ${exam.name}`); } catch {}

    // Fan out an in-app broadcast to every parent in the exam's class so a
    // "New test for your child" card appears on each parent dashboard.
    // Best-effort: any failure here must not fail the create call.
    try {
      await notifyParentsOfNewExam(exam, session);
    } catch (e) {
      console.warn(`[exams] parent fan-out failed: ${e.message}`);
    }

    return NextResponse.json({ ok: true, exam });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}

async function notifyParentsOfNewExam(exam, session) {
  // Look up students in the exam's class — Supabase first (where new
  // admissions live), then merge in anything still in the file store.
  const cls = exam.cls;
  if (!cls) return;
  const seen = new Set();
  const studentsInCls = [];
  if (supabaseEnabled) {
    const sel = await supabase.from("students").select("*").eq("cls", cls);
    if (!sel.error && Array.isArray(sel.data)) {
      for (const row of sel.data) {
        const s = fromStudent(row);
        if (s.id && !seen.has(s.id)) { seen.add(s.id); studentsInCls.push(s); }
      }
    }
  }
  try {
    const data = await readAllData();
    for (const s of (data.addedStudents || [])) {
      if (s.cls === cls && s.id && !seen.has(s.id)) {
        seen.add(s.id);
        studentsInCls.push(s);
      }
    }
  } catch {}

  if (studentsInCls.length === 0) return;

  // One short, parent-friendly message — same shape for every recipient,
  // but addressed individually so each parent only sees their own child.
  const dateLabel = exam.date
    ? new Date(exam.date).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })
    : "soon";
  const examType = exam.type ? `${exam.type} · ` : "";
  const message = [
    `New test for your child:`,
    "",
    `Subject: ${exam.subject}`,
    `Exam:    ${examType}${exam.name}`,
    `Class:   ${exam.cls}`,
    `Date:    ${dateLabel}`,
    exam.maxMarks ? `Max marks: ${exam.maxMarks}` : null,
    "",
    "Please help your child prepare. Marks will appear here once they're entered.",
    "— Sanfort International School",
  ].filter(Boolean).join("\n");

  const campaign = `New test · ${exam.subject}`;
  for (const s of studentsInCls) {
    try {
      await addBroadcast({
        campaign,
        channel: "in_app",
        audience: `student_${s.id}`,
        audienceLabel: s.name || s.id,
        message,
        sent: 1,
        delivered: 1,
      });
    } catch (e) {
      console.warn(`[exams] broadcast to ${s.id} failed: ${e.message}`);
    }
  }
}

export async function DELETE(req) {
  const session = await getSession();
  if (!session || !CAN_CREATE.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  const removed = await removeExam(body.id);
  if (!removed) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  try { await logAudit(session.name || "User", "Removed exam", `${removed.id} · ${removed.name}`); } catch {}
  return NextResponse.json({ ok: true });
}
