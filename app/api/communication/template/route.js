import { NextResponse } from "next/server";
import { addTemplate, removeTemplate, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function POST(req) {
  const session = await getSession();
  const actor = session?.name || "Principal";

  let body; try { body = await req.json(); } catch { body = null; }
  try {
    const tpl = await addTemplate(body || {});
    try { await logAudit(actor, "Added template", `${tpl.id} ${tpl.name} · ${tpl.channel}`); } catch {}
    return NextResponse.json({ ok: true, template: tpl });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }
}

export async function DELETE(req) {
  const session = await getSession();
  const actor = session?.name || "Principal";
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  const removed = await removeTemplate(body.id);
  if (!removed) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  try { await logAudit(actor, "Removed template", `${removed.id} ${removed.name}`); } catch {}
  return NextResponse.json({ ok: true });
}
