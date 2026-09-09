import { NextResponse } from "next/server";
import {
  listRouteTemplates,
  addRouteTemplate,
  updateRouteTemplate,
  removeRouteTemplate,
  logAudit,
} from "@/lib/db";
import { getSession } from "@/lib/auth";

// Admin + principal can manage the master timetable (template CRUD).
// Teachers can READ the list (used by the "My route today" card +
// scheduling helpers) but not write. Parents are blocked entirely.
const WRITE_ROLES = new Set(["admin", "principal", "transport_manager"]);
const READ_ROLES  = new Set(["admin", "principal", "academic_director", "teacher", "transport_manager"]);

function gate(session, set) {
  if (!session) return { ok: false, error: "Sign in required", status: 401 };
  if (!set.has(session.role)) return { ok: false, error: "Not allowed for your role", status: 403 };
  return { ok: true };
}

// GET /api/transport/templates → { ok, templates: [...] }
export async function GET() {
  const session = await getSession();
  const g = gate(session, READ_ROLES);
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  try {
    const templates = await listRouteTemplates();
    return NextResponse.json({ ok: true, templates });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}

// POST /api/transport/templates { code, name, direction, bus?, tripNo?, stops:[{name,t}] }
export async function POST(req) {
  const session = await getSession();
  const g = gate(session, WRITE_ROLES);
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.code?.trim()) {
    return NextResponse.json({ ok: false, error: "Template code is required" }, { status: 400 });
  }
  if (!Array.isArray(body.stops) || body.stops.length === 0) {
    return NextResponse.json({ ok: false, error: "Add at least one stop" }, { status: 400 });
  }
  try {
    const template = await addRouteTemplate(body);
    try { await logAudit(session.name || "Admin", "Added route template", `${template.code} · ${template.name}`); } catch {}
    return NextResponse.json({ ok: true, template });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}

// PATCH /api/transport/templates { code, ...patch }
// patch fields: name, bus, direction, tripNo, active, stops
export async function PATCH(req) {
  const session = await getSession();
  const g = gate(session, WRITE_ROLES);
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.code) {
    return NextResponse.json({ ok: false, error: "code required" }, { status: 400 });
  }
  if ("stops" in body && (!Array.isArray(body.stops) || body.stops.length === 0)) {
    return NextResponse.json({ ok: false, error: "Stops list cannot be empty" }, { status: 400 });
  }
  try {
    const template = await updateRouteTemplate(body.code, body);
    if (!template) return NextResponse.json({ ok: false, error: "Template not found" }, { status: 404 });
    try { await logAudit(session.name || "Admin", "Updated route template", `${template.code} · ${template.name}`); } catch {}
    return NextResponse.json({ ok: true, template });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}

// DELETE /api/transport/templates { code } → soft delete (active=false)
export async function DELETE(req) {
  const session = await getSession();
  const g = gate(session, WRITE_ROLES);
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.code) {
    return NextResponse.json({ ok: false, error: "code required" }, { status: 400 });
  }
  try {
    const template = await removeRouteTemplate(body.code);
    if (!template) return NextResponse.json({ ok: false, error: "Template not found" }, { status: 404 });
    try { await logAudit(session.name || "Admin", "Archived route template", `${template.code}`); } catch {}
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}
