import { NextResponse } from "next/server";
import { undoLastFeeEdit, addActivity, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

// POST /api/fees/undo { id }
// Revert the most recent fee edit for a student. Only valid for one
// hour after the edit was made (snapshots auto-expire). Reverses both
// the pending-fee outstanding AND any receipts the edit created. Once
// the snapshot is consumed it's gone — there's no "redo" stack.
//
// Parents are read-only.
export async function POST(req) {
  const session = await getSession();
  if (session?.role === "parent") {
    return NextResponse.json(
      { ok: false, error: "Only school staff can undo fee edits." },
      { status: 403 }
    );
  }
  const actor = session?.name || "Staff";

  let body; try { body = await req.json(); } catch { body = null; }
  const id = body?.id;
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  let result;
  try {
    result = await undoLastFeeEdit({ studentId: id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
  if (!result) {
    return NextResponse.json({
      ok: false,
      error: "No recent edit to undo (or the one-hour undo window has passed).",
    }, { status: 410 });
  }

  try {
    await addActivity({
      t: "fee", tone: "warn",
      title: `Fee edit undone · ${id}`,
      sub: `restored total ₹${result.restoredTotal.toLocaleString("en-IN")} · paid ₹${result.restoredPaid.toLocaleString("en-IN")}`,
      ts: "now",
    });
  } catch {}
  try {
    await logAudit(actor, "Undid fee edit", `${id} · restored total ₹${result.restoredTotal.toLocaleString("en-IN")}`);
  } catch {}

  return NextResponse.json({ ok: true, ...result });
}
