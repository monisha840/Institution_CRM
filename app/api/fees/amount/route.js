import { NextResponse } from "next/server";
import { setPendingFeeAmount, addActivity, logAudit, readAllData } from "@/lib/db";
import { getSession } from "@/lib/auth";

// PATCH /api/fees/amount { id, amount }
// Edits the outstanding pending-fee balance for a student. Used by the
// Students screen's fee cell — admins can bump the amount UP (e.g.,
// add extra charges like late fee, books) but can NEVER reduce it.
// The "no reductions" rule is enforced server-side so a power-user
// with direct API access can't write a smaller number either. If a
// school legitimately needs to refund / discount, that's a future
// receipt-side action, not an edit to the outstanding.
// Parents are read-only; staff (any non-parent role) may edit.
export async function PATCH(req) {
  const session = await getSession();
  if (session?.role === "parent") {
    return NextResponse.json(
      { ok: false, error: "Only school staff can edit fee amounts." },
      { status: 403 }
    );
  }
  const actor = session?.name || "Principal";

  let body; try { body = await req.json(); } catch { body = null; }
  const id = body?.id;
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  if (body.amount == null || body.amount === "") {
    return NextResponse.json({ ok: false, error: "amount required" }, { status: 400 });
  }
  const n = Math.floor(Number(body.amount));
  if (!Number.isFinite(n) || n < 0) {
    return NextResponse.json({ ok: false, error: "Amount must be 0 or more" }, { status: 400 });
  }

  // Read the current pending balance so we can enforce increase-only.
  // The pending row's id === student id for the annual fee created at
  // import time. If no pending row exists (student paid in full or
  // never had a fee), any positive amount is an increase.
  const all = await readAllData();
  const existing = (all.pendingFees || []).find((f) => f.id === id);
  const currentAmount = existing ? Number(existing.amount) || 0 : 0;
  if (n < currentAmount) {
    return NextResponse.json({
      ok: false,
      error: `Cannot reduce the fee amount. Current outstanding is ₹${currentAmount.toLocaleString("en-IN")}; you tried to set ₹${n.toLocaleString("en-IN")}.`,
    }, { status: 400 });
  }

  const result = await setPendingFeeAmount(id, n);
  if (!result) return NextResponse.json({ ok: false, error: "Student not found" }, { status: 404 });

  try {
    await addActivity({
      t: "fee", tone: "warn",
      title: `Fee amount updated · ${id}`,
      sub: `outstanding set to ₹${n.toLocaleString("en-IN")}`,
      ts: "now",
    });
  } catch {}
  try {
    await logAudit(actor, "Edited fee amount", `${id} · outstanding ₹${n.toLocaleString("en-IN")}`);
  } catch {}

  return NextResponse.json({ ok: true, amount: n, fee: result.fee });
}
