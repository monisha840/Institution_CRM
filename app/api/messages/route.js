import { NextResponse } from "next/server";
import {
  addMessage, listMessagesBetween, listMessageThreads,
  markMessagesReadBetween, listUsers, addNotification, logAudit,
} from "@/lib/db";
import { DEMO_ACCOUNTS } from "@/lib/seed-users";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Allowed conversation pairs. Parents can only message admin; admin can
// reply to anyone but the UI surfaces only parent threads. Principals
// can also receive parent messages on the admin's behalf.
const ADMIN_ROLES = new Set(["admin", "principal"]);

// Roles allowed to initiate messages to a specific parent. Teacher /
// academic_director / school_accountant join admin / principal so any
// staff member who signs in can reach a parent and the conversation
// shows up in both the sender's history and the parent's inbox.
// trust_accountant is intentionally excluded — trust-side staff don't
// touch the parent communication stream.
const STAFF_SENDER_ROLES = new Set([
  "admin", "principal", "academic_director", "teacher", "school_accountant",
]);

// GET /api/messages
//   ?with=USR-XXX  → fetch full conversation between session.sub and that user
//   (no `with`)    → return inbox = thread list
export async function GET(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  const url = new URL(req.url);
  const otherId = url.searchParams.get("with");

  if (otherId) {
    const thread = await listMessagesBetween(session.sub, otherId, { limit: 200 });
    return NextResponse.json({ ok: true, messages: thread });
  }

  const threads = await listMessageThreads(session.sub);
  // Decorate threads with the other party's name + role for display.
  const users = await listUsers();
  const userMap = new Map(users.map((u) => [u.id, u]));
  const decorated = threads.map((t) => {
    const u = userMap.get(t.otherId);
    return {
      ...t,
      otherName: u?.name || t.otherId,
      otherEmail: u?.email || null,
      otherRole: t.otherRole || u?.role || null,
    };
  });
  return NextResponse.json({ ok: true, threads: decorated });
}

// POST /api/messages { receiverId, message }
//
// Parents may send only to admin / principal. Admin / principal may
// send to anyone. Other roles are blocked at the API layer (the UI
// hides the entry point but defence in depth is cheap).
export async function POST(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });

  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.message || !String(body.message).trim()) {
    return NextResponse.json({ ok: false, error: "Message body required" }, { status: 400 });
  }

  // Resolve receiver. Parents don't have to specify — we route to the
  // first admin we find (then principal as a fallback).
  let receiverId = body.receiverId;
  let receiverRole = null;

  if (session.role === "parent") {
    const users = await listUsers();
    // Route to whichever admin-equivalent account exists. Order of
    // preference: admin → principal → super (legacy) → super_admin →
    // school_accountant (last-resort so the message never bounces).
    const preference = ["admin", "principal", "super", "super_admin", "school_accountant"];
    let admin = null;
    for (const role of preference) {
      admin = users.find((u) => u.role === role);
      if (admin) break;
    }
    // FINAL fallback: the DB has no admin user (common on fresh
    // installs where the owner only ever logged in via the in-memory
    // demo account — DEMO_ACCOUNTS bypasses the users table on login,
    // so the row may not exist). Synthesise a receiver from the demo
    // admin so parent messages always have somewhere to land. The next
    // time the admin signs in via the demo creds, their inbox will
    // pick up the threaded message exactly the same way as if a real
    // DB user had received it (we addMessage with the demo id below).
    if (!admin) {
      const demoAdmin = DEMO_ACCOUNTS.find((a) => a.role === "admin")
        || DEMO_ACCOUNTS.find((a) => a.role === "principal");
      if (demoAdmin) {
        admin = { id: demoAdmin.id, role: demoAdmin.role, name: demoAdmin.name };
        console.warn(`[messages] Routing parent message to DEMO admin '${demoAdmin.id}' — no DB admin row exists yet. Add one with: insert into users (id,email,role,name,password_hash) values ('${demoAdmin.id}','${demoAdmin.email}','${demoAdmin.role}','${demoAdmin.name}',<bcrypt-hash>);`);
      }
    }
    if (!admin) {
      return NextResponse.json(
        {
          ok: false,
          error: `No admin account found. Roles in the system: ${[...new Set(users.map((u) => u.role).filter(Boolean))].join(", ") || "(none)"}.`,
        },
        { status: 503 }
      );
    }
    receiverId = admin.id;
    receiverRole = admin.role;
  } else if (STAFF_SENDER_ROLES.has(session.role)) {
    if (!receiverId) return NextResponse.json({ ok: false, error: "receiverId required" }, { status: 400 });
    const users = await listUsers();
    const target = users.find((u) => u.id === receiverId);
    if (!target) return NextResponse.json({ ok: false, error: "Recipient not found" }, { status: 404 });
    // Non-admin staff can only message parents on this stream — internal
    // staff-to-staff chat goes through /api/chat. Admin / principal keep
    // their existing freedom (replying to anyone).
    if (!ADMIN_ROLES.has(session.role) && target.role !== "parent") {
      return NextResponse.json(
        { ok: false, error: "You can only message parent accounts on this stream" },
        { status: 403 }
      );
    }
    receiverRole = target.role;
  } else {
    return NextResponse.json(
      { ok: false, error: "Your role can't use the parent messaging stream" },
      { status: 403 }
    );
  }

  try {
    const msg = await addMessage({
      senderId: session.sub, receiverId,
      senderRole: session.role, receiverRole,
      message: body.message,
    });
    // Notify the receiver via the bell.
    try {
      await addNotification({
        userId: receiverId,
        type: "parent_message",
        title: session.role === "parent"
          ? `New message from ${session.name || "a parent"}`
          : `New message from ${session.name || session.role}`,
        description: msg.message.slice(0, 90),
        redirectUrl: `?screen=messages&with=${session.sub}`,
      });
    } catch {}
    try {
      await logAudit(
        session.name || "User", "Sent message",
        `${msg.id} · ${session.role}→${receiverRole}`
      );
    } catch {}
    return NextResponse.json({ ok: true, message: msg });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }
}

// PATCH /api/messages { with } — mark every message FROM that user TO
// the signed-in user as read. Used when the chat panel opens a thread.
export async function PATCH(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.with) return NextResponse.json({ ok: false, error: "with required" }, { status: 400 });
  const marked = await markMessagesReadBetween(body.with, session.sub);
  return NextResponse.json({ ok: true, marked });
}
