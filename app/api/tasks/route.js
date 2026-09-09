import { NextResponse } from "next/server";
import { listTasks, addTask, updateTask, removeTask, getUserByEmail, listUsers, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/tasks  → admin: every task; everyone else: tasks assigned to them.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  const all = await listTasks();
  if (session.role === "admin") return NextResponse.json({ ok: true, tasks: all });
  const mine = all.filter((t) => isTaskAssignee(t, session));
  return NextResponse.json({ ok: true, tasks: mine });
}

function sessionIds(session) {
  return [session?.sub, session?.id, session?.email].filter(Boolean).map(String);
}

function isTaskAssignee(task, session) {
  const ids = new Set(sessionIds(session));
  return ids.has(String(task.assignedTo || ""));
}

// POST /api/tasks  { title, description?, assignedTo?, priority?, dueDate?, self? }
// Admin can assign to any staff. Non-admin staff can only create a self-task
// (assigned to themselves). Parents cannot create tasks.
export async function POST(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  if (session.role === "parent") {
    return NextResponse.json({ ok: false, error: "Parents cannot create tasks" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.title?.trim()) return NextResponse.json({ ok: false, error: "title required" }, { status: 400 });

  const isAdmin = session.role === "admin";
  const myId = session.sub || session.id;
  const users = await listUsers();

  let target = null;
  if (!isAdmin || body.self === true) {
    // Self-task: always pin to the signed-in user.
    target = users.find((u) => u.id === myId || u.email === session.email) || null;
    if (!target) {
      // Session may not be in users list (edge) — synthesize from session.
      target = {
        id: myId || session.email,
        name: session.name || "Staff",
        role: session.role || "staff",
        email: session.email,
      };
    }
  } else {
    if (!body.assignedTo) return NextResponse.json({ ok: false, error: "assignedTo required" }, { status: 400 });
    target = users.find((u) => u.id === body.assignedTo) || null;
    if (!target && String(body.assignedTo).includes("@")) {
      target = await getUserByEmail(body.assignedTo);
    }
    if (!target) return NextResponse.json({ ok: false, error: "Assignee not found" }, { status: 404 });
  }

  if (target.role === "parent") {
    return NextResponse.json({ ok: false, error: "Tasks cannot be assigned to parents" }, { status: 400 });
  }

  try {
    const task = await addTask({
      title: body.title,
      description: body.description,
      assignedTo: target.id,
      assignedToName: target.name,
      assignedToRole: target.role,
      assignedBy: myId || session.email,
      assignedByName: session.name || (isAdmin ? "Admin" : "Self"),
      priority: body.priority,
      dueDate: body.dueDate,
    });
    const verb = (!isAdmin || body.self === true) && target.id === (myId || target.id)
      ? "Created self-task"
      : "Assigned task";
    try { await logAudit(session.name || "User", verb, `${task.id} → ${target.name} (${target.role}) · ${task.title}`); } catch {}
    return NextResponse.json({ ok: true, task });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed to create task" }, { status: 500 });
  }
}

// PATCH /api/tasks  { id, status?, response?, remarks?, title?, description?, priority?, dueDate? }
// Admin can patch anything; the assignee can set Yes/No + remarks (and status).
export async function PATCH(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const existing = (await listTasks()).find((t) => t.id === body.id);
  if (!existing) return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });

  const isAdmin = session.role === "admin";
  const isAssignee = isTaskAssignee(existing, session);
  if (!isAdmin && !isAssignee) {
    return NextResponse.json({ ok: false, error: "Not authorised to update this task" }, { status: 403 });
  }
  // Non-admin assignee: Yes/No answer + remarks only.
  const patch = isAdmin
    ? body
    : {
        ...(body.response !== undefined ? { response: body.response } : {}),
        ...(body.remarks !== undefined ? { remarks: body.remarks } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      };

  if (patch.response !== undefined && patch.response !== null && !["yes", "no"].includes(patch.response)) {
    return NextResponse.json({ ok: false, error: "response must be yes|no" }, { status: 400 });
  }

  try {
    const updated = await updateTask(body.id, patch);
    const answer = updated.response ? ` · answer=${updated.response}` : "";
    try {
      await logAudit(
        session.name || "User",
        "Updated task",
        `${updated.id} · status=${updated.status}${answer}${updated.remarks ? ` · remarks: ${String(updated.remarks).slice(0, 120)}` : ""}`
      );
    } catch {}
    return NextResponse.json({ ok: true, task: updated });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}

// DELETE /api/tasks  { id }
// Admin can remove any task. Staff can remove their own self-created tasks.
export async function DELETE(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const existing = (await listTasks()).find((t) => t.id === body.id);
  if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const isAdmin = session.role === "admin";
  const myId = session.sub || session.id;
  const isSelfCreated = existing.assignedBy === myId || existing.assignedBy === session.email;
  if (!isAdmin && !isSelfCreated) {
    return NextResponse.json({ ok: false, error: "Only admin or the creator can remove this task" }, { status: 403 });
  }

  const removed = await removeTask(body.id);
  if (!removed) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  try { await logAudit(session.name || "User", "Removed task", `${removed.id} · ${removed.title}`); } catch {}
  return NextResponse.json({ ok: true });
}
