import { NextResponse } from "next/server";
import {
  listSyllabus, addSyllabusEntry, removeSyllabusEntry, removeAllSyllabusForClass,
  logAudit, listRoleFeatureAccess,
} from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Canonical roles that can edit the year's syllabus. Teachers and parents
// get read-only access via the screen — they shouldn't be rewriting the
// curriculum. Custom roles fall back to the role_feature_access toggle on
// the "syllabus" feature.
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

// GET /api/syllabus?cls=5-A   → optionally scope to one class
export async function GET(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const url = new URL(req.url);
  const cls = url.searchParams.get("cls");
  const all = await listSyllabus();
  const rows = cls
    ? all.filter((r) => String(r.cls).toUpperCase() === cls.toUpperCase())
    : all;
  return NextResponse.json({ ok: true, syllabus: rows });
}

// POST /api/syllabus { cls, subject, chapter?, topic, term?, weekNo?, notes? }
export async function POST(req) {
  const session = await getSession();
  if (!session || !(await canWriteSyllabus(session.role))) {
    return NextResponse.json({ ok: false, error: "Not authorised to edit syllabus" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "body required" }, { status: 400 });
  }
  try {
    const row = await addSyllabusEntry(body, session.name || session.email);
    try {
      await logAudit(session.name || "User", "Added syllabus topic", `${row.cls} · ${row.subject} · ${row.topic}`);
    } catch {}
    return NextResponse.json({ ok: true, entry: row });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }
}

// DELETE /api/syllabus { id }                — single row
// DELETE /api/syllabus { allForClass: '5-A' } — wipe a whole class
export async function DELETE(req) {
  const session = await getSession();
  if (!session || !(await canWriteSyllabus(session.role))) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (body?.allForClass) {
    try {
      const n = await removeAllSyllabusForClass(body.allForClass);
      try {
        await logAudit(session.name || "User", "Wiped class syllabus", `${body.allForClass} · ${n} row${n === 1 ? "" : "s"}`);
      } catch {}
      return NextResponse.json({ ok: true, removed: n });
    } catch (e) {
      return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
    }
  }
  if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  const removed = await removeSyllabusEntry(body.id);
  if (!removed) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  try {
    await logAudit(session.name || "User", "Removed syllabus topic", `${removed.cls} · ${removed.subject} · ${removed.topic}`);
  } catch {}
  return NextResponse.json({ ok: true });
}
