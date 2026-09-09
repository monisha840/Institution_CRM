import { NextResponse } from "next/server";
import {
  addLeaveRequest, listLeaveRequests, updateLeaveRequestStatus,
  notifyRole, addNotification, logAudit, readAllData,
} from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const APPROVE_ROLES = new Set(["admin", "principal"]);

// GET /api/leave-requests?status=pending&requesterId=…&requesterType=…
//
// Visibility rules:
//   - admin / principal      → see everything
//   - teacher                → see their own requests + students in their classes
//   - parent                 → see their child's requests only
//   - school/trust accountant → not relevant, return empty
export async function GET(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;

  if (APPROVE_ROLES.has(session.role)) {
    const items = await listLeaveRequests({ status, limit: 200 });
    return NextResponse.json({ ok: true, items });
  }
  if (session.role === "parent") {
    if (!session.linkedId) return NextResponse.json({ ok: true, items: [] });
    const items = await listLeaveRequests({
      status, requesterType: "student", requesterId: session.linkedId, limit: 200,
    });
    return NextResponse.json({ ok: true, items });
  }
  if (session.role === "teacher") {
    // Teacher sees: own requests + every student's request that's in
    // their assigned classes. We compute the student id set from
    // session.linkedClasses and the cached student roster.
    const own = await listLeaveRequests({
      status, requesterType: "teacher", requesterId: session.sub, limit: 200,
    });
    let scopedStudent = [];
    try {
      const data = await readAllData();
      const myClasses = new Set(Array.isArray(session.linkedClasses) ? session.linkedClasses : []);
      const studentIds = new Set(
        (data.addedStudents || []).filter((s) => myClasses.has(s.cls)).map((s) => s.id)
      );
      const all = await listLeaveRequests({ status, requesterType: "student", limit: 500 });
      scopedStudent = all.filter((r) => studentIds.has(r.requesterId));
    } catch {}
    const items = [...own, ...scopedStudent].sort((a, b) =>
      new Date(b.createdAt) - new Date(a.createdAt)
    );
    return NextResponse.json({ ok: true, items });
  }
  return NextResponse.json({ ok: true, items: [] });
}

// POST /api/leave-requests { requesterType, requesterId, leaveType, reason, fromDate, toDate }
//
// Parents file for their child (requesterType=student, requesterId=their
// linkedId). Teachers file for themselves (requesterType=teacher,
// requesterId=session.sub). Admin/principal can file on behalf of anyone.
export async function POST(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });

  let body; try { body = await req.json(); } catch { body = null; }
  if (!body) return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });

  // Resolve requesterType + requesterId based on the caller's role.
  let requesterType = body.requesterType;
  let requesterId   = body.requesterId;
  if (session.role === "parent") {
    requesterType = "student";
    requesterId   = session.linkedId;
    if (!requesterId) return NextResponse.json({ ok: false, error: "No child linked to your account" }, { status: 400 });
  } else if (session.role === "teacher" && requesterType === "teacher") {
    requesterId = session.sub;
  }

  // Look up a friendly name for the request payload + audit log.
  let requesterName = body.requesterName || null;
  let requesterCls  = body.requesterCls  || null;
  try {
    const data = await readAllData();
    if (requesterType === "student") {
      const s = (data.addedStudents || []).find((x) => x.id === requesterId);
      if (s) { requesterName = requesterName || s.name; requesterCls = requesterCls || s.cls; }
    } else if (requesterType === "teacher") {
      const u = (data.users || []).find((x) => x.id === requesterId);
      if (u) requesterName = requesterName || u.name;
    }
  } catch {}

  try {
    const lr = await addLeaveRequest({
      requesterType, requesterId,
      leaveType: body.leaveType || "casual",
      reason: body.reason || "",
      fromDate: body.fromDate, toDate: body.toDate,
      requesterName, requesterCls,
    });
    try {
      await notifyRole(["admin", "principal"], {
        type: "leave_request",
        title: `Leave request · ${requesterName || requesterId}`,
        description: `${lr.fromDate} → ${lr.toDate} · ${lr.leaveType}${lr.reason ? ` · ${lr.reason.slice(0, 80)}` : ""}`,
        redirectUrl: `?screen=leave&id=${lr.id}`,
      });
    } catch {}
    try {
      await logAudit(
        session.name || session.email || "User",
        "Submitted leave request",
        `${lr.id} · ${requesterType} ${requesterName || requesterId} · ${lr.fromDate}→${lr.toDate}`
      );
    } catch {}
    return NextResponse.json({ ok: true, request: lr });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }
}

// PATCH /api/leave-requests { id, status } — approve/reject. Admin or
// principal only. Notifies the requester (if they have a user account).
export async function PATCH(req) {
  const session = await getSession();
  if (!session || !APPROVE_ROLES.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Only admin / principal can review leave" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id || !body?.status) {
    return NextResponse.json({ ok: false, error: "id and status required" }, { status: 400 });
  }
  let updated;
  try {
    updated = await updateLeaveRequestStatus(body.id, {
      status: body.status,
      approvedBy: session.sub,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }
  if (!updated) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  // Notify the requester (parent if student, the teacher themself otherwise).
  try {
    const data = await readAllData();
    const users = data.users || [];
    let notifyUserId = null;
    if (updated.requesterType === "teacher") {
      notifyUserId = updated.requesterId;
    } else if (updated.requesterType === "student") {
      const parent = users.find((u) => u.role === "parent" && u.linkedId === updated.requesterId);
      notifyUserId = parent?.id || null;
    }
    if (notifyUserId) {
      await addNotification({
        userId: notifyUserId,
        type: "leave_request",
        title: `Leave ${updated.approvalStatus}`,
        description: `${updated.fromDate} → ${updated.toDate} · ${updated.leaveType}`,
        redirectUrl: `?screen=leave&id=${updated.id}`,
      });
    }
  } catch {}

  try {
    await logAudit(
      session.name || "User",
      `${updated.approvalStatus === "approved" ? "Approved" : "Rejected"} leave`,
      `${updated.id} · ${updated.requesterType} ${updated.requesterId}`
    );
  } catch {}
  return NextResponse.json({ ok: true, request: updated });
}
