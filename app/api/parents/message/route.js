import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { addBroadcast, logAudit, addMessage, listUsers, addNotification } from "@/lib/db";

export const dynamic = "force-dynamic";

// Roles allowed to send a one-shot message to a parent. Trust accountant
// is intentionally excluded — trust-side staff don't touch the parent
// communication stream.
const CAN_MESSAGE = new Set([
  "admin", "principal", "teacher", "academic_director", "school_accountant",
]);

// POST /api/parents/message  { studentId, studentName, cls?, message }
// Writes an in-app broadcast addressed to a single student. The parent sees
// it on their dashboard ("From the school" card) — no WhatsApp / SMS leaves
// the system.
export async function POST(req) {
  const session = await getSession();
  if (!session || !CAN_MESSAGE.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  const studentId = body?.studentId;
  const studentName = body?.studentName || studentId || "Student";
  const message = (body?.message || "").trim();
  if (!studentId) return NextResponse.json({ ok: false, error: "studentId required" }, { status: 400 });
  if (!message) return NextResponse.json({ ok: false, error: "message required" }, { status: 400 });

  try {
    const broadcast = await addBroadcast({
      campaign: `Message from ${session.name || "School"}`,
      channel: "in_app",
      audience: `student_${studentId}`,
      audienceLabel: studentName,
      message,
      sent: 1,
      delivered: 1,
    });
    // Cross-post to the messages table so the conversation also appears
    // in the sender's "Parent messages" inbox AND the parent's "Message
    // admin" thread list — keeping every channel in sync per the
    // communication-visibility requirement. Best-effort: a failure here
    // doesn't break the broadcast (the parent dashboard "From the school"
    // card still reads from broadcasts).
    let directMessage = null;
    try {
      const users = await listUsers();
      const parentUser = users.find((u) => u.role === "parent" && u.linkedId === studentId);
      if (parentUser) {
        directMessage = await addMessage({
          senderId: session.sub,
          receiverId: parentUser.id,
          senderRole: session.role,
          receiverRole: "parent",
          message,
        });
        try {
          await addNotification({
            userId: parentUser.id,
            type: "parent_message",
            title: `New message from ${session.name || session.role}`,
            description: message.slice(0, 90),
            redirectUrl: `?screen=messages&with=${session.sub}`,
          });
        } catch {}
      }
    } catch {}
    try {
      await logAudit(
        session.name || "Staff",
        "Sent in-app message to parent",
        `${studentName} (${studentId}) · ${message.length} char${message.length === 1 ? "" : "s"}`
      );
    } catch {}
    return NextResponse.json({ ok: true, broadcast, message: directMessage });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}
