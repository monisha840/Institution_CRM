import { NextResponse } from "next/server";
import {
  addStudentActivity, listStudentActivities, removeStudentActivity,
  addNotification, logAudit, readAllData,
} from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const WRITE_ROLES  = new Set(["admin", "principal", "academic_director", "teacher"]);
const DELETE_ROLES = new Set(["admin", "principal"]);

// GET /api/student-activities?studentId=…&achievementLevel=…&externalCompetition=true
export async function GET(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });

  const url = new URL(req.url);
  const studentId        = url.searchParams.get("studentId") || undefined;
  const achievementLevel = url.searchParams.get("achievementLevel") || undefined;
  const ext              = url.searchParams.get("externalCompetition");

  let items = await listStudentActivities({
    studentId, achievementLevel,
    externalCompetition: ext === "true" ? true : ext === "false" ? false : undefined,
    limit: 500,
  });

  // Parent: scope to their own child only.
  if (session.role === "parent") {
    items = items.filter((a) => a.studentId === session.linkedId);
  }
  // Teacher: scope to assigned classes (when no specific studentId is asked).
  if (session.role === "teacher" && !studentId) {
    try {
      const data = await readAllData();
      const myClasses = new Set(Array.isArray(session.linkedClasses) ? session.linkedClasses : []);
      const studentIds = new Set(
        (data.addedStudents || []).filter((s) => myClasses.has(s.cls)).map((s) => s.id)
      );
      items = items.filter((a) => studentIds.has(a.studentId));
    } catch {}
  }
  return NextResponse.json({ ok: true, items });
}

// POST /api/student-activities { studentId, activityName, eventName?, achievementLevel?, externalCompetition?, activityLink?, certificateDocument?, activityDate? }
export async function POST(req) {
  const session = await getSession();
  if (!session || !WRITE_ROLES.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.studentId || !body?.activityName) {
    return NextResponse.json({ ok: false, error: "studentId and activityName required" }, { status: 400 });
  }
  // Teachers may only log against students in their class.
  if (session.role === "teacher") {
    try {
      const data = await readAllData();
      const myClasses = new Set(Array.isArray(session.linkedClasses) ? session.linkedClasses : []);
      const ok = (data.addedStudents || []).some((s) => s.id === body.studentId && myClasses.has(s.cls));
      if (!ok) return NextResponse.json({ ok: false, error: "Student is not in your class" }, { status: 403 });
    } catch {}
  }
  try {
    const activity = await addStudentActivity({
      studentId:           body.studentId,
      activityName:        body.activityName,
      eventName:           body.eventName || null,
      achievementLevel:    body.achievementLevel || "participation",
      externalCompetition: !!body.externalCompetition,
      activityLink:        body.activityLink || null,
      certificateDocument: body.certificateDocument || null,
      activityDate:        body.activityDate || null,
      createdBy:           session.sub,
    });
    // Fan out: notify the linked parent + every class teacher assigned
    // to the student's class. This mirrors the remarks/rewards flow so
    // achievements are surfaced across all the people who care about
    // the student. Best-effort — failures are swallowed.
    try {
      const data = await readAllData();
      const student = (data.addedStudents || []).find((s) => s.id === activity.studentId);
      const studentCls = student?.cls || null;
      const recipients = new Set();

      // Parent linked to the student.
      const parent = (data.users || []).find((u) => u.role === "parent" && u.linkedId === activity.studentId);
      if (parent) recipients.add(parent.id);

      // Every teacher whose linkedClasses includes the student's class.
      // Skip the actor — no point notifying yourself.
      if (studentCls) {
        for (const u of (data.users || [])) {
          if (u.role !== "teacher") continue;
          if (u.id === session.sub) continue;
          const classes = Array.isArray(u.linkedClasses) ? u.linkedClasses : [];
          const single  = u.linkedId ? [u.linkedId] : [];
          if (classes.includes(studentCls) || single.includes(studentCls)) {
            recipients.add(u.id);
          }
        }
      }

      const levelLabel = ({
        winner: "🥇 1st place", runner_up: "🥈 Runner up", third: "🥉 3rd",
        honourable: "Honourable mention", selected: "Selected", participation: "Participation",
      })[activity.achievementLevel] || activity.achievementLevel;
      const studentLabel = student ? `${student.name}${studentCls ? ` · ${studentCls}` : ""}` : activity.studentId;
      for (const uid of recipients) {
        await addNotification({
          userId: uid,
          type: "remark_reward", // re-use the icon mapping
          title: `New achievement · ${studentLabel} · ${levelLabel}`,
          description: `${activity.activityName}${activity.eventName ? ` · ${activity.eventName}` : ""}`.slice(0, 120),
          redirectUrl: `?screen=student_activities&id=${activity.id}`,
        });
      }
    } catch {}
    try {
      await logAudit(
        session.name || "User", "Logged student activity",
        `${activity.id} · ${activity.studentId} · ${activity.activityName}`
      );
    } catch {}
    return NextResponse.json({ ok: true, activity });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }
}

export async function DELETE(req) {
  const session = await getSession();
  if (!session || !DELETE_ROLES.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  const removed = await removeStudentActivity(body.id);
  if (!removed) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  try { await logAudit(session.name || "User", "Removed student activity", `${removed.id} · ${removed.studentId}`); } catch {}
  return NextResponse.json({ ok: true });
}
