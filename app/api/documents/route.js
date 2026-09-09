import { NextResponse } from "next/server";
import { addDocument, listDocuments, removeDocument, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX_BYTES = 2_500_000; // 2.5 MB cap on the base64 string itself

// GET /api/documents?entityType=student&entityId=STN-XXXX
export async function GET(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const url = new URL(req.url);
  const entityType = url.searchParams.get("entityType") || undefined;
  const entityId = url.searchParams.get("entityId") || undefined;
  const docs = await listDocuments({ entityType, entityId });
  return NextResponse.json({ ok: true, documents: docs });
}

// POST /api/documents { entityType, entityId, label, fileName, mimeType, dataUrl }
export async function POST(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  if (!["admin", "principal", "academic_director", "teacher"].includes(session.role)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.entityType || !body?.entityId || !body?.fileName || !body?.dataUrl) {
    return NextResponse.json({ ok: false, error: "entityType, entityId, fileName, dataUrl all required" }, { status: 400 });
  }
  if (String(body.dataUrl).length > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: `File too large (max ${Math.round(MAX_BYTES / 1024)}KB after encoding)` }, { status: 413 });
  }
  try {
    const doc = await addDocument({
      entityType: body.entityType, entityId: body.entityId,
      label: body.label, fileName: body.fileName,
      mimeType: body.mimeType, dataUrl: body.dataUrl,
      uploadedBy: session.name || session.email || "unknown",
    });
    try { await logAudit(session.name || "User", "Uploaded document", `${doc.id} · ${body.entityType}:${body.entityId} · ${body.fileName}`); } catch {}
    const { dataUrl, ...safe } = doc;
    return NextResponse.json({ ok: true, document: safe });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}

// DELETE /api/documents { id }
export async function DELETE(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  if (!["admin", "principal"].includes(session.role)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  const removed = await removeDocument(body.id);
  if (!removed) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  try { await logAudit(session.name || "User", "Removed document", `${removed.id} · ${removed.fileName}`); } catch {}
  return NextResponse.json({ ok: true });
}
