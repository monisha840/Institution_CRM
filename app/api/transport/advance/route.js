import { NextResponse } from "next/server";
import { advanceRoute, logAudit, readAllData } from "@/lib/db";
import { dispatchTransportNotifications } from "@/lib/transport-notify";
import { getSession } from "@/lib/auth";

const ALLOWED = new Set(["start", "next", "prev", "finish", "reset"]);
// Roles that can always advance any route (no per-route check needed).
const ADMIN_ROLES = new Set(["admin", "principal", "academic_director", "transport_manager"]);

// POST /api/transport/advance { code, action: 'start'|'next'|'prev'|'finish'|'reset' }
// Allowed callers:
//   - admin / principal / academic_director — any route
//   - teacher whose name matches the route's attendant — only that route
//   - everyone else — 403
export async function POST(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  const actor = session.name || "Staff";

  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.code || !ALLOWED.has(body.action)) {
    return NextResponse.json({ ok: false, error: "code + valid action required" }, { status: 400 });
  }

  if (!ADMIN_ROLES.has(session.role)) {
    if (session.role !== "teacher") {
      return NextResponse.json({ ok: false, error: "Only the assigned teacher can advance this bus." }, { status: 403 });
    }
    // Teacher: look up the route and confirm the attendant name matches
    // this teacher (case-insensitive, trimmed). Cheap one-shot read.
    try {
      const data = await readAllData();
      const route = (data.routes || []).find((r) => r.code === body.code);
      const attendant = (route?.attendant || "").trim().toLowerCase();
      const me = (session.name || "").trim().toLowerCase();
      if (!attendant || attendant === "—" || attendant !== me) {
        return NextResponse.json({ ok: false, error: "You're not assigned as the teacher for this route." }, { status: 403 });
      }
    } catch (e) {
      return NextResponse.json({ ok: false, error: "Could not verify route assignment" }, { status: 500 });
    }
  }

  try {
    const result = await advanceRoute(body.code, body.action);
    if (!result) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    const { route, event } = result;

    // Build a friendly audit-line message
    const stops = Array.isArray(route.stops) ? route.stops : [];
    const cur = stops.find((s) => s.status === "current");
    let summary = "";
    if      (body.action === "start")  summary = `Run started · at ${cur?.name || "stop 1"}`;
    else if (body.action === "next")   summary = route.status === "completed"
      ? "Run completed"
      : `Advanced to ${cur?.name || "next stop"}`;
    else if (body.action === "prev")   summary = `Stepped back to ${cur?.name || "previous stop"}`;
    else if (body.action === "finish") summary = "Run marked complete";
    else if (body.action === "reset")  summary = "Run reset for next trip";
    try { await logAudit(actor, "Bus run · " + body.action, `${route.code} · ${summary}`); } catch {}

    // External notification fan-out (in-app + WhatsApp). Best-effort —
    // a downstream notification failure must never break the bus advance.
    // prev/reset return event=null so this is a no-op for admin corrections.
    let notify = null;
    if (event) {
      try {
        notify = await dispatchTransportNotifications(route, event);
      } catch (e) {
        console.warn(`[advance] notification fan-out failed (non-fatal): ${e.message}`);
      }
    }

    return NextResponse.json({ ok: true, route, summary, notify });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}
