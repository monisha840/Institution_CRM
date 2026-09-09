import { NextResponse } from "next/server";
import { addBook, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

const STAFF = new Set(["admin", "principal", "academic_director", "teacher"]);

// POST /api/library/books/import  { rows: [{ title, author?, category?, isbn?, shelf?, totalCopies? }, ...] }
//
// Bulk-create books from a parsed spreadsheet. Returns a per-row result so
// the UI can show "imported 24 of 26 — 2 skipped (missing title)" instead
// of an all-or-nothing error.
export async function POST(req) {
  const session = await getSession();
  if (!session || !STAFF.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  const rows = Array.isArray(body?.rows) ? body.rows : null;
  if (!rows) return NextResponse.json({ ok: false, error: "rows array required" }, { status: 400 });
  if (rows.length === 0) return NextResponse.json({ ok: false, error: "Spreadsheet has no rows" }, { status: 400 });
  if (rows.length > 2000) return NextResponse.json({ ok: false, error: "Max 2000 rows per import" }, { status: 400 });

  const imported = [];
  const errors   = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || typeof row !== "object") {
      errors.push({ row: i + 1, reason: "not an object" });
      continue;
    }
    if (!row.title || !String(row.title).trim()) {
      errors.push({ row: i + 1, reason: "missing title" });
      continue;
    }
    try {
      const book = await addBook({
        title: String(row.title).trim(),
        author: row.author ? String(row.author).trim() : "",
        category: row.category ? String(row.category).trim() : "general",
        isbn: row.isbn ? String(row.isbn).trim() : null,
        shelf: row.shelf ? String(row.shelf).trim() : null,
        totalCopies: Math.max(1, Number(row.totalCopies) || 1),
      });
      imported.push({ row: i + 1, id: book.id, title: book.title });
    } catch (e) {
      errors.push({ row: i + 1, reason: e.message || "Failed to add" });
    }
  }
  try {
    await logAudit(
      session.name || "Librarian",
      "Imported library books",
      `${imported.length} of ${rows.length} rows imported${errors.length ? ` · ${errors.length} skipped` : ""}`
    );
  } catch {}
  return NextResponse.json({ ok: true, imported, errors });
}
