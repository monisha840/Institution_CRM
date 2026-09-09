import { NextResponse } from "next/server";
import {
  addGovernmentDocument, listGovernmentDocuments,
  updateGovernmentDocument, removeGovernmentDocument,
  logAudit,
} from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Strictly admin-only — these are trust legal documents (registration,
// 80G / 12A certs, fire NOC, building plans). Principal can view-only.
const WRITE_ROLES = new Set(["admin"]);
const READ_ROLES  = new Set(["admin", "principal"]);

export async function GET() {
  const session = await getSession();
  if (!session || !READ_ROLES.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }
  const items = await listGovernmentDocuments({ limit: 200 });
  return NextResponse.json({ ok: true, items });
}

export async function POST(req) {
  const session = await getSession();
  if (!session || !WRITE_ROLES.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Only admin can upload government documents" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.title) return NextResponse.json({ ok: false, error: "title required" }, { status: 400 });
  try {
    const doc = await addGovernmentDocument({
      title: body.title,
      documentType: body.documentType || null,
      fileUrl: body.fileUrl || null,
      expiryDate: body.expiryDate || null,
      uploadedBy: session.sub,
      notes: body.notes || null,
    });
    try { await logAudit(session.name || "Admin", "Added government document", `${doc.id} · ${doc.title}`); } catch {}
    return NextResponse.json({ ok: true, document: doc });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }
}

export async function PATCH(req) {
  const session = await getSession();
  if (!session || !WRITE_ROLES.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  const updated = await updateGovernmentDocument(body.id, body);
  if (!updated) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  try { await logAudit(session.name || "Admin", "Updated government document", `${updated.id} · ${updated.title}`); } catch {}
  return NextResponse.json({ ok: true, document: updated });
}

export async function DELETE(req) {
  const session = await getSession();
  if (!session || !WRITE_ROLES.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  const removed = await removeGovernmentDocument(body.id);
  if (!removed) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  try { await logAudit(session.name || "Admin", "Removed government document", `${removed.id} · ${removed.title}`); } catch {}
  return NextResponse.json({ ok: true });
}
