import { NextResponse } from "next/server";
import { deleteRecentFee, addActivity, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

// DELETE /api/fees/receipt { id }
// Removes a single receipt row (from BOTH Supabase + file store, in case
// it lived in either). Used by the Fees screen "✕" button for fixing
// wrongly-entered payments. Does NOT restore the matching pending_fees
// balance — that's a separate, deliberate action via the Edit fees flow.
//
// Staff-only (admin, principal, school_accountant). Parents + teachers
// are 403'd at the gate.
export async function DELETE(req) {
  const session = await getSession();
  const role = session?.role;
  const allowed = role === "admin" || role === "principal" || role === "school_accountant";
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "Only Admin / Principal / Accountant can delete receipts." },
      { status: 403 }
    );
  }
  const actor = session?.name || "Staff";

  let body; try { body = await req.json(); } catch { body = null; }
  const id = body?.id;
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const removed = await deleteRecentFee(id);
  if (!removed) {
    return NextResponse.json({ ok: false, error: "Receipt not found" }, { status: 404 });
  }

  const amt = Number(removed.amount) || 0;
  const studentName = removed.name || removed.student_name || "?";
  try {
    await addActivity({
      t: "fee", tone: "warn",
      title: `Receipt deleted · ${id}`,
      sub: `${studentName} · ₹${amt.toLocaleString("en-IN")} removed from history`,
      ts: "now",
    });
  } catch {}
  try {
    await logAudit(actor, "Deleted fee receipt", `${id} · ${studentName} · ₹${amt.toLocaleString("en-IN")}`);
  } catch {}

  return NextResponse.json({ ok: true, removed });
}
