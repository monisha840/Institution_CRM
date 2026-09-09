import { NextResponse } from "next/server";
import { listSubjects, addSubject, removeSubject, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

const STAFF = new Set(["admin", "principal", "academic_director"]);

// GET /api/subjects — public list (any signed-in user). Used by Timetable
// and Exams pickers.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  const subjects = await listSubjects();
  return NextResponse.json({ ok: true, subjects });
}

// POST /api/subjects { name, code?, category? }
// Adds a subject to the global list. Staff-only.
export async function POST(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  if (!STAFF.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Only academic director / principal / admin can add subjects" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.name?.trim()) return NextResponse.json({ ok: false, error: "Subject name is required" }, { status: 400 });

  let subject;
  try {
    subject = await addSubject({
      name: body.name,
      code: body.code,
      category: body.category,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }

  try { await logAudit(session.name || "Director", "Added subject", `${subject.name} · ${subject.category}`); } catch {}
  return NextResponse.json({ ok: true, subject });
}

// DELETE /api/subjects { id }
// Removes a subject from the global list. Existing timetable / exam rows
// referencing the name keep working — they store the subject as text.
export async function DELETE(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  if (!STAFF.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Only academic director / principal / admin can remove subjects" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const removed = await removeSubject(body.id);
  if (!removed) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  try { await logAudit(session.name || "Director", "Removed subject", `${removed.name}`); } catch {}
  return NextResponse.json({ ok: true });
}
