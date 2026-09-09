import { NextResponse } from "next/server";
import { addSyllabusEntry, removeAllSyllabusForClass, logAudit, listRoleFeatureAccess } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const CAN_WRITE = new Set(["admin", "principal", "academic_director"]);

async function canWriteSyllabus(role) {
  if (CAN_WRITE.has(role)) return true;
  if (!role || typeof role !== "string" || !role.startsWith("role-")) return false;
  try {
    const feats = await listRoleFeatureAccess(role);
    const f = feats.find((x) => x.featureName === "syllabus");
    return !!(f && f.canEdit);
  } catch { return false; }
}

// POST /api/syllabus/import
//   { rows: [{ cls, subject, chapter?, topic, term?, weekNo?, notes? }, ...],
//     replaceClasses?: bool }
//
// Bulk-creates syllabus entries from a parsed spreadsheet. Returns a per-row
// result so the UI can show "imported 92 of 100 — 8 skipped (missing topic)"
// instead of an all-or-nothing error.
//
// When `replaceClasses` is true, every class id present in the upload first
// has its existing rows wiped — useful for re-importing a corrected plan
// without leaving duplicates from the previous version.
export async function POST(req) {
  const session = await getSession();
  if (!session || !(await canWriteSyllabus(session.role))) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  const rows = Array.isArray(body?.rows) ? body.rows : null;
  if (!rows) return NextResponse.json({ ok: false, error: "rows array required" }, { status: 400 });
  if (rows.length === 0) return NextResponse.json({ ok: false, error: "Spreadsheet has no rows" }, { status: 400 });
  if (rows.length > 5000) return NextResponse.json({ ok: false, error: "Max 5000 rows per import" }, { status: 400 });

  const replace = !!body?.replaceClasses;
  let wiped = 0;
  if (replace) {
    // Collect unique class ids from the upload, then wipe each one. We do it
    // before the inserts so the new rows are the only ones for those classes.
    const classes = new Set(
      rows.map((r) => String(r?.cls || "").trim().toUpperCase().replace(/\s+/g, ""))
        .filter(Boolean)
    );
    for (const cls of classes) {
      try { wiped += await removeAllSyllabusForClass(cls); } catch {}
    }
  }

  const imported = [];
  const errors   = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || typeof row !== "object") {
      errors.push({ row: i + 1, reason: "not an object" });
      continue;
    }
    try {
      const saved = await addSyllabusEntry(row, session.name || session.email);
      imported.push({ row: i + 1, id: saved.id, cls: saved.cls, topic: saved.topic });
    } catch (e) {
      errors.push({ row: i + 1, reason: e.message || "Failed to add" });
    }
  }
  try {
    await logAudit(
      session.name || "User",
      replace ? "Replaced class syllabus" : "Imported syllabus rows",
      `${imported.length} of ${rows.length} rows imported${errors.length ? ` · ${errors.length} skipped` : ""}${replace ? ` · wiped ${wiped} prior` : ""}`
    );
  } catch {}
  return NextResponse.json({ ok: true, imported, errors, wiped });
}
