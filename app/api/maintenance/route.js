import { NextResponse } from "next/server";
import { addMaintenanceLog, listMaintenanceLogs, removeMaintenanceLog, logAudit, __MAINTENANCE_META } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const CAN_RECORD = new Set(["admin", "principal", "transport_manager"]);

// GET /api/maintenance?busNumber=XX
export async function GET(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const url = new URL(req.url);
  const busNumber = url.searchParams.get("busNumber") || undefined;
  const logs = await listMaintenanceLogs({ busNumber });
  return NextResponse.json({ ok: true, logs, meta: __MAINTENANCE_META });
}

// POST /api/maintenance { busNumber, routeCode?, type, date?, odometer?, vendor?, cost?, notes?, nextDueDate? }
export async function POST(req) {
  const session = await getSession();
  if (!session || !CAN_RECORD.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Only admin / principal can log maintenance" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.busNumber) return NextResponse.json({ ok: false, error: "busNumber required" }, { status: 400 });
  try {
    const log = await addMaintenanceLog({ ...body, recordedBy: session.name || session.email });
    try { await logAudit(session.name || "User", "Logged maintenance", `${log.id} · ${log.busNumber} · ${log.type}${log.cost ? ` · ₹${log.cost.toLocaleString("en-IN")}` : ""}`); } catch {}
    return NextResponse.json({ ok: true, log });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}

// DELETE /api/maintenance { id }
export async function DELETE(req) {
  const session = await getSession();
  if (!session || !CAN_RECORD.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  const removed = await removeMaintenanceLog(body.id);
  if (!removed) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  try { await logAudit(session.name || "User", "Removed maintenance log", `${removed.id} · ${removed.busNumber}`); } catch {}
  return NextResponse.json({ ok: true });
}
