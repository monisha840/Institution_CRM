import { NextResponse } from "next/server";
import { addInventoryCategory, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function POST(req) {
  const session = await getSession();
  if (!session || !["admin", "principal"].includes(session.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  const raw = body?.category;
  if (!raw || !String(raw).trim()) {
    return NextResponse.json({ ok: false, error: "Category is required" }, { status: 400 });
  }
  try {
    const category = await addInventoryCategory(raw);
    try { await logAudit(session.name || "Principal", "Added inventory category", category); } catch {}
    return NextResponse.json({ ok: true, category });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}
