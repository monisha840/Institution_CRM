import { NextResponse } from "next/server";
import { recordTransportAttendance, logAudit, notifyStudentParent, markAttendanceBulk } from "@/lib/db";
import { getSession } from "@/lib/auth";

const TRANSPORT_STATUSES = ["boarded", "absent", "skipped", "dropped", "parent"];

// POST /api/transport/attendance
//   { studentId, date?, direction?, status, routeCode?, stopName?, studentName?, cls? }
// Records (or flips) a per-student boarding entry. Composite key is
// (studentId, date, direction) so re-tapping the same trip overwrites
// without leaving stale rows behind.
//
// Morning "absent" also seeds class attendance as absent so the teacher
// sees the bus miss. "parent" is set later from class attendance when the
// teacher marks Dropped by parent (unlocks evening transport).
export async function POST(req) {
  const session = await getSession();
  // Parents must not be able to mark their own child boarded — only staff
  // physically at the bus do that.
  if (session?.role === "parent") {
    return NextResponse.json(
      { ok: false, error: "Only school staff can record transport attendance." },
      { status: 403 }
    );
  }
  const actor = session?.name || "Driver";

  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.studentId) {
    return NextResponse.json({ ok: false, error: "studentId required" }, { status: 400 });
  }
  if (!body?.status || !TRANSPORT_STATUSES.includes(body.status)) {
    return NextResponse.json({ ok: false, error: "status must be boarded|absent|skipped|dropped|parent" }, { status: 400 });
  }

  let row;
  try {
    row = await recordTransportAttendance({ ...body, markedBy: actor });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }

  try {
    await logAudit(
      actor,
      `Transport ${row.status}`,
      `${row.studentName || row.studentId} · ${row.routeCode || "—"} · ${row.direction} · ${row.date}`
    );
  } catch {}

  // Morning bus absent → class roster starts as absent. Teacher can later
  // flip to "Dropped by parent" if the child arrives by car.
  if (row.status === "absent" && row.direction === "morning") {
    try {
      await markAttendanceBulk({
        date: row.date,
        cls: row.cls || null,
        postedBy: actor,
        marks: [{
          studentId: row.studentId,
          studentName: row.studentName || row.studentId,
          attendance: "absent",
          leaveReason: "Missed morning bus",
        }],
      });
    } catch {}
  }

  // Evening drop → push an in-app notification to the child's parent so they
  // know the student has been dropped off from the bus.
  if (row.status === "dropped") {
    try {
      await notifyStudentParent(row.studentId, {
        type: "transport",
        title: "Your child has been dropped from the bus",
        description: `${row.studentName || "Your child"} was safely dropped${row.stopName ? ` at ${row.stopName}` : ""}.`,
      });
    } catch {}
  }

  return NextResponse.json({ ok: true, attendance: row });
}
