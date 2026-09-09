import { NextResponse } from "next/server";
import { listMeetings, addMeeting, rsvpMeeting, removeMeeting, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const CAN_CREATE = new Set(["admin", "principal", "academic_director", "teacher"]);

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  // Teachers and parents need their class set so we can scope class-targeted meetings.
  const classes = Array.isArray(session.linkedClasses) && session.linkedClasses.length
    ? session.linkedClasses
    : (session.linkedId ? [session.linkedId] : []);
  const meetings = await listMeetings({ forEmail: session.email, role: session.role, classes });
  return NextResponse.json({ ok: true, meetings });
}

// POST /api/meetings — create a meeting
//   { title, description?, scheduledAt, location?, audience, audienceLabel? }
//   audience is "all" | "class:1-A" | "user:email"
// Or RSVP:
//   { id, response: "yes"|"no"|"maybe" }
export async function POST(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  let body; try { body = await req.json(); } catch { body = null; }

  // RSVP path — anyone signed in can RSVP to a meeting they can see.
  if (body?.id && body?.response) {
    try {
      const meeting = await rsvpMeeting({
        id: body.id,
        fromEmail: session.email,
        fromName: session.name,
        response: body.response,
      });
      return NextResponse.json({ ok: true, meeting });
    } catch (e) {
      return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
    }
  }

  // Create path — staff only.
  if (!CAN_CREATE.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Not authorised to create meetings" }, { status: 403 });
  }
  if (!body?.title || !body?.scheduledAt || !body?.audience) {
    return NextResponse.json({ ok: false, error: "title, scheduledAt, audience required" }, { status: 400 });
  }
  try {
    const m = await addMeeting({
      ...body,
      createdByEmail: session.email,
      createdByName: session.name,
    });
    try { await logAudit(session.name || "User", "Scheduled meeting", `${m.id} · ${m.title} · ${m.audienceLabel}`); } catch {}
    return NextResponse.json({ ok: true, meeting: m });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}

export async function DELETE(req) {
  const session = await getSession();
  if (!session || !["admin", "principal"].includes(session.role)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  const removed = await removeMeeting(body.id);
  if (!removed) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  try { await logAudit(session.name || "User", "Removed meeting", `${removed.id} · ${removed.title}`); } catch {}
  return NextResponse.json({ ok: true });
}
