import { NextResponse } from "next/server";
import { getDocument } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/documents/{id}  → streams the file payload back to the browser.
// Used by the inline preview / download button.
export async function GET(_req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const doc = await getDocument(params.id);
  if (!doc) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const m = String(doc.dataUrl || "").match(/^data:[^;]+;base64,(.+)$/);
  if (!m) return NextResponse.json({ ok: false, error: "Bad payload" }, { status: 500 });
  const buf = Buffer.from(m[1], "base64");
  return new Response(buf, {
    headers: {
      "content-type": doc.mimeType || "application/octet-stream",
      "content-disposition": `inline; filename="${doc.fileName}"`,
      "cache-control": "private, max-age=60",
    },
  });
}
