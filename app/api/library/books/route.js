import { NextResponse } from "next/server";
import { addBook, updateBook, removeBook, removeAllBooks, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Only librarian/admin/principal/teacher can mutate the catalog. Parents are
// read-only (the screen filters them out anyway, but enforce server-side).
const STAFF = new Set(["admin", "principal", "academic_director", "teacher"]);

// Wiping the entire catalogue is admin/principal-only — too destructive
// for a teacher account. Server-side enforcement below.
const WIPE_ROLES = new Set(["admin", "principal"]);

export async function POST(req) {
  const session = await getSession();
  if (!session || !STAFF.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.title?.trim()) {
    return NextResponse.json({ ok: false, error: "Title is required" }, { status: 400 });
  }
  try {
    const book = await addBook(body);
    try { await logAudit(session.name || "Librarian", "Added library book", `${book.id} · ${book.title}`); } catch {}
    return NextResponse.json({ ok: true, book });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}

export async function PATCH(req) {
  const session = await getSession();
  if (!session || !STAFF.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  try {
    const book = await updateBook(body.id, body);
    if (!book) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    try { await logAudit(session.name || "Librarian", "Updated library book", `${book.id} · ${book.title}`); } catch {}
    return NextResponse.json({ ok: true, book });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}

export async function DELETE(req) {
  const session = await getSession();
  if (!session || !STAFF.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }

  // Bulk wipe path — admin / principal only, requires explicit
  // confirm string in the payload to prevent accidental fat-finger.
  if (body?.all === true) {
    if (!WIPE_ROLES.has(session.role)) {
      return NextResponse.json({ ok: false, error: "Only admin / principal can remove all books" }, { status: 403 });
    }
    if (body.confirm !== "REMOVE ALL BOOKS") {
      return NextResponse.json({ ok: false, error: "Confirmation phrase missing" }, { status: 400 });
    }
    try {
      const count = await removeAllBooks();
      try { await logAudit(session.name || "Admin", "Removed ALL library books", `${count} book${count === 1 ? "" : "s"}`); } catch {}
      return NextResponse.json({ ok: true, removed: count });
    } catch (e) {
      return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
    }
  }

  if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  try {
    const removed = await removeBook(body.id);
    if (!removed) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    try { await logAudit(session.name || "Librarian", "Removed library book", `${removed.id} · ${removed.title}`); } catch {}
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}
