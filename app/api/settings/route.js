import { NextResponse } from "next/server";
import { readSettings, writeSettings, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  const settings = await readSettings();
  return NextResponse.json({ ok: true, settings });
}

// PUT /api/settings { settings: { section: { key: value } } }
export async function PUT(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ ok: false, error: "Only admin" }, { status: 403 });
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.settings || typeof body.settings !== "object") {
    return NextResponse.json({ ok: false, error: "settings object required" }, { status: 400 });
  }
  try {
    const merged = await writeSettings(body.settings);
    const sections = Object.keys(body.settings).join(", ");
    try { await logAudit(session.name || "Admin", "Updated settings", sections); } catch {}
    return NextResponse.json({ ok: true, settings: merged });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }
}
