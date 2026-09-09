import { NextResponse } from "next/server";
import {
  addRemarkReward, listRemarksRewards, removeRemarkReward,
  resolveRemarkReward, reopenRemarkReward,
  addNotification, logAudit, readAllData,
} from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Who can write what:
//   admin / principal       → reward or remark, student or teacher
//   academic_director       → reward or remark, student only
//   teacher                 → reward or remark, students in their class only
const WRITE_ROLES = new Set(["admin", "principal", "academic_director", "teacher"]);
const DELETE_ROLES = new Set(["admin", "principal"]);
// Marking a remark resolved is an admin/principal/academic_director task.
// Teachers report and rewards/remarks; closing the loop is a leadership action.
const RESOLVE_ROLES = new Set(["admin", "principal", "academic_director"]);

// GET /api/remarks-rewards?targetType=student&targetId=…&type=reward
export async function GET(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  const url = new URL(req.url);
  const targetType = url.searchParams.get("targetType") || undefined;
  const targetId   = url.searchParams.get("targetId")   || undefined;
  const type       = url.searchParams.get("type")       || undefined;

  let items = await listRemarksRewards({ targetType, targetId, type, limit: 200 });

  // Parent: only their own child's records.
  if (session.role === "parent") {
    items = items.filter((r) => r.targetType === "student" && r.targetId === session.linkedId);
  }
  // Teacher (no specific target requested): scope to assigned classes,
  // and include any staff record about *them* — whether the writer
  // stamped the user account id or the linked staff row id, both
  // resolve to "this is mine".
  if (session.role === "teacher" && !targetId) {
    try {
      const data = await readAllData();
      const myClasses = new Set(Array.isArray(session.linkedClasses) ? session.linkedClasses : []);
      const studentIds = new Set(
        (data.addedStudents || []).filter((s) => myClasses.has(s.cls)).map((s) => s.id)
      );
      // Find the staff row linked to this user account by email so a
      // record stamped with the staff id (legacy data path) still matches.
      const myStaff = (data.staff || []).find(
        (s) => s.email && session.email && s.email.toLowerCase() === session.email.toLowerCase()
      );
      const myIds = new Set([session.sub]);
      if (myStaff?.id) myIds.add(myStaff.id);
      items = items.filter((r) =>
        (r.targetType === "student" && studentIds.has(r.targetId)) ||
        (r.targetType === "teacher" && myIds.has(r.targetId))
      );
    } catch {}
  }
  return NextResponse.json({ ok: true, items });
}

// POST /api/remarks-rewards { targetType, targetId, type, category?, description, actionTaken? }
export async function POST(req) {
  const session = await getSession();
  if (!session || !WRITE_ROLES.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body) return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });

  // Role-specific guardrails.
  if (session.role === "academic_director" && body.targetType === "teacher") {
    return NextResponse.json({ ok: false, error: "Academic Director can only log against students" }, { status: 403 });
  }
  if (session.role === "teacher") {
    if (body.targetType !== "student") {
      return NextResponse.json({ ok: false, error: "Teachers can only log against their students" }, { status: 403 });
    }
    try {
      const data = await readAllData();
      const myClasses = new Set(Array.isArray(session.linkedClasses) ? session.linkedClasses : []);
      const ok = (data.addedStudents || []).some((s) => s.id === body.targetId && myClasses.has(s.cls));
      if (!ok) return NextResponse.json({ ok: false, error: "Student is not in your assigned class" }, { status: 403 });
    } catch {}
  }

  try {
    const rr = await addRemarkReward({
      targetType:  body.targetType,
      targetId:    body.targetId,
      type:        body.type,
      category:    body.category || null,
      description: body.description,
      actionTaken: body.actionTaken || null,
      createdBy:   session.sub,
    });
    // Fan out notifications. For a student target: the linked parent +
    // the class teacher(s) assigned to the student's class. For a staff
    // target: the staff member themself + admin (so HR has visibility).
    // Each notification is best-effort — failures are swallowed.
    if (rr.targetType === "student") {
      try {
        const data = await readAllData();
        const student = (data.addedStudents || []).find((s) => s.id === rr.targetId);
        const studentCls = student?.cls || null;
        const recipients = new Set();

        // Parent linked to the student.
        const parent = (data.users || []).find((u) => u.role === "parent" && u.linkedId === rr.targetId);
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

        const studentLabel = student ? `${student.name}${studentCls ? ` · ${studentCls}` : ""}` : rr.targetId;
        for (const uid of recipients) {
          await addNotification({
            userId: uid,
            type: "remark_reward",
            title: `New ${rr.type} · ${studentLabel}`,
            description: `${rr.category ? rr.category + " · " : ""}${(rr.description || "").slice(0, 90)}`,
            redirectUrl: `?screen=remarks_rewards&id=${rr.id}`,
          });
        }
      } catch {}
    } else if (rr.targetType === "teacher") {
      // Two-tier fan-out for staff entries:
      //   - The staff member themself gets a *personal* "Your ___"
      //     title so it lands as "this is about you" in their bell.
      //   - Every other admin gets the neutral "New staff ___" title.
      // The form may have stamped either a user account id or a staff
      // row id as targetId — resolve to the actual user id (via email
      // match through the staff table) before writing the notification,
      // otherwise the receiver's bell would never find it.
      try {
        const data = await readAllData();
        let targetUser = (data.users || []).find((u) => u.id === rr.targetId);
        if (!targetUser) {
          // targetId is probably a staff row id; follow staff.email →
          // users.email to find the linked account.
          const staffRow = (data.staff || []).find((s) => s.id === rr.targetId);
          if (staffRow?.email) {
            const wanted = staffRow.email.toLowerCase();
            targetUser = (data.users || []).find((u) => (u.email || "").toLowerCase() === wanted);
          }
        }
        const targetName =
          targetUser?.name ||
          (data.staff || []).find((s) => s.id === rr.targetId)?.name ||
          "Staff member";

        // Personal notification to the target — only if we resolved a
        // real user account and they're not the actor.
        if (targetUser && targetUser.id !== session.sub) {
          await addNotification({
            userId: targetUser.id,
            type: "remark_reward",
            title: `Your ${rr.type} on record${rr.category ? ` · ${rr.category}` : ""}`,
            description: (rr.description || "").slice(0, 120),
            redirectUrl: `?screen=remarks_rewards&id=${rr.id}`,
          });
        }

        // Neutral notification to every other admin.
        for (const u of (data.users || [])) {
          if (u.role !== "admin") continue;
          if (u.id === session.sub) continue;
          if (targetUser && u.id === targetUser.id) continue;
          await addNotification({
            userId: u.id,
            type: "remark_reward",
            title: `New staff ${rr.type} · ${targetName}`,
            description: `${rr.category ? rr.category + " · " : ""}${(rr.description || "").slice(0, 90)}`,
            redirectUrl: `?screen=remarks_rewards&id=${rr.id}`,
          });
        }
      } catch {}
    }
    try {
      await logAudit(
        session.name || "User",
        `Logged ${rr.type}`,
        `${rr.targetType} ${rr.targetId}${rr.category ? ` · ${rr.category}` : ""}`
      );
    } catch {}
    return NextResponse.json({ ok: true, item: rr });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }
}

// PATCH /api/remarks-rewards { id, action: "resolve" | "reopen", resolutionNote? }
//   Mark a remark/reward row as resolved (or undo). The audit trail and
//   the original entry are preserved — this just attaches metadata that
//   the screen renders as a "Resolved" chip.
export async function PATCH(req) {
  const session = await getSession();
  if (!session || !RESOLVE_ROLES.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  const action = body.action === "reopen" ? "reopen" : "resolve";

  try {
    const updated = action === "reopen"
      ? await reopenRemarkReward(body.id)
      : await resolveRemarkReward(body.id, {
          resolvedBy: session.sub,
          resolutionNote: body.resolutionNote || null,
        });
    if (!updated) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    try {
      await logAudit(
        session.name || "User",
        action === "reopen" ? "Reopened remark/reward" : "Resolved remark/reward",
        `${updated.id}${body.resolutionNote ? ` · ${String(body.resolutionNote).slice(0, 80)}` : ""}`,
      );
    } catch {}
    return NextResponse.json({ ok: true, item: updated });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }
}

// DELETE /api/remarks-rewards { id }
export async function DELETE(req) {
  const session = await getSession();
  if (!session || !DELETE_ROLES.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  const removed = await removeRemarkReward(body.id);
  if (!removed) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  try {
    await logAudit(session.name || "User", `Removed ${removed.type}`, `${removed.targetType} ${removed.targetId}`);
  } catch {}
  return NextResponse.json({ ok: true });
}
