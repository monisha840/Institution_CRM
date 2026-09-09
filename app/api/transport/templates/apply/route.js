import { NextResponse } from "next/server";
import { applyRouteTemplate, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

const WRITE_ROLES = new Set(["admin", "principal", "transport_manager"]);

// POST /api/transport/templates/apply { code }
// Replaces (or creates) the live `routes` row whose code matches the
// template. Attendant / driver / bus are preserved from the existing
// route if it has them, so re-applying doesn't unassign the teacher.
export async function POST(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  if (!WRITE_ROLES.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Only admin/principal can apply templates" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.code) {
    return NextResponse.json({ ok: false, error: "code required" }, { status: 400 });
  }
  try {
    const result = await applyRouteTemplate(body.code, { actor: session.name });
    try {
      await logAudit(
        session.name || "Admin",
        "Applied route template",
        `${result.template.code} → live route reset · attendant preserved: ${result.preserved.attendant}`
      );
    } catch {}
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}
