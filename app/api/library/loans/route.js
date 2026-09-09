import { NextResponse } from "next/server";
import { borrowBook, returnBook, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

const STAFF = new Set(["admin", "principal", "academic_director", "teacher"]);

// POST /api/library/loans
//   { bookId, borrowerType, borrowerId, borrowerName, dueDays? }
// Issue a book to a student or teacher.
export async function POST(req) {
  const session = await getSession();
  if (!session || !STAFF.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  try {
    const loan = await borrowBook({
      bookId: body?.bookId,
      borrowerType: body?.borrowerType,
      borrowerId: body?.borrowerId,
      borrowerName: body?.borrowerName,
      dueDays: body?.dueDays,
      issuedBy: session.name || "Librarian",
    });
    try {
      await logAudit(
        session.name || "Librarian",
        "Issued library book",
        `${loan.bookTitle} → ${loan.borrowerName} (${loan.borrowerType})`
      );
    } catch {}
    return NextResponse.json({ ok: true, loan });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }
}

// PATCH /api/library/loans { id }  → mark returned
export async function PATCH(req) {
  const session = await getSession();
  if (!session || !STAFF.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  try {
    const loan = await returnBook(body.id, session.name || "Librarian");
    if (!loan) return NextResponse.json({ ok: false, error: "Loan not found" }, { status: 404 });
    try {
      await logAudit(
        session.name || "Librarian",
        "Returned library book",
        `${loan.bookTitle} ← ${loan.borrowerName}`
      );
    } catch {}
    return NextResponse.json({ ok: true, loan });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}
