import { NextResponse } from "next/server";
import { editStudentFee, setStudentTransportFee, addActivity, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

// POST /api/fees/edit { id, total, paid, transport? }
// Edits a student's annual fee — supports raising the total AND/OR
// recording an "already paid" amount in one call. Both numbers are
// increase-only at the storage layer (see db.editStudentFee for the
// guard logic). Successful edits are snapshotted so the admin has a
// one-hour window to undo via /api/fees/undo.
//
// Optional `transport` field — when provided, sets the student's
// transport-fee pending row alongside the annual edit. Only sent by
// the UI for students who actually have transport assigned.
//
// Parents are read-only.
export async function POST(req) {
  const session = await getSession();
  if (session?.role === "parent") {
    return NextResponse.json(
      { ok: false, error: "Only school staff can edit fee amounts." },
      { status: 403 }
    );
  }
  const actor = session?.name || "Staff";

  let body; try { body = await req.json(); } catch { body = null; }
  const id = body?.id;
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  if (body.total == null || body.total === "") {
    return NextResponse.json({ ok: false, error: "total required" }, { status: 400 });
  }
  const total = Math.floor(Number(body.total));
  const paid  = Math.max(0, Math.floor(Number(body.paid) || 0));
  if (!Number.isFinite(total) || total < 0) {
    return NextResponse.json({ ok: false, error: "Total must be 0 or more" }, { status: 400 });
  }

  const transportProvided = body.transport != null && body.transport !== "";
  let transport = 0;
  if (transportProvided) {
    transport = Math.floor(Number(body.transport));
    if (!Number.isFinite(transport) || transport < 0) {
      return NextResponse.json({ ok: false, error: "Transport fee must be 0 or more" }, { status: 400 });
    }
  }

  let result;
  try {
    result = await editStudentFee({ studentId: id, newTotal: total, newPaid: paid, actor });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }

  let transportResult = null;
  if (transportProvided) {
    try {
      transportResult = await setStudentTransportFee({ studentId: id, amount: transport, actor });
    } catch (e) {
      // Surface the transport-side failure but don't roll back the academic
      // edit — that already succeeded and shouldn't be undone silently.
      return NextResponse.json({
        ok: false,
        error: `Academic fee saved, but transport fee update failed: ${e.message}`,
        ...result,
      }, { status: 400 });
    }
  }

  const transportSub = transportResult
    ? ` · transport ₹${transportResult.newAmount.toLocaleString("en-IN")}`
    : "";

  try {
    await addActivity({
      t: "fee", tone: "warn",
      title: `Fee updated · ${id}`,
      sub: `total ₹${total.toLocaleString("en-IN")} · paid ₹${paid.toLocaleString("en-IN")}${transportSub}`,
      ts: "now",
    });
  } catch {}
  try {
    await logAudit(actor, "Edited fee", `${id} · total ₹${total.toLocaleString("en-IN")} · paid ₹${paid.toLocaleString("en-IN")}${transportSub}`);
  } catch {}

  return NextResponse.json({ ok: true, ...result, transport: transportResult });
}
