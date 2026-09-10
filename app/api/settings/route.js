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
  // institutionType is a property of the tenant, not a setting. It is fixed
  // by which institution you signed in to, and flipping it would leave the
  // school's records wearing the college's vocabulary. Silently dropped
  // rather than rejected, so a client that still sends the old field saves
  // the rest of its changes instead of failing the whole request.
  const incoming = { ...body.settings };
  if (incoming.school && typeof incoming.school === "object") {
    const { institutionType, institution_type, ...school } = incoming.school;
    incoming.school = school;
  }

  try {
    const merged = await writeSettings(incoming);
    const sections = Object.keys(incoming).join(", ");
    try { await logAudit(session.name || "Admin", "Updated settings", sections); } catch {}
    return NextResponse.json({ ok: true, settings: merged });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }
}
