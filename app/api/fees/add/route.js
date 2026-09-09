import { NextResponse } from "next/server";
import { addStudentFeeItem, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { feeTypeLabel, normalizeFeeType } from "@/lib/format";

// POST /api/fees/add { studentId, feeType, amount, due? }
// Append a brand-new pending-fee row of a given type for a student. Used by
// the "Add fee" button on the Fees screen so staff can collect Application,
// Kit, ECA, Uniform, Term I/II/III, Van, STEM, Annual Day separately.
export async function POST(req) {
  const session = await getSession();
  if (session?.role === "parent") {
    return NextResponse.json({ ok: false, error: "Read-only role" }, { status: 403 });
  }
  const actor = session?.name || "Principal";

  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.studentId) {
    return NextResponse.json({ ok: false, error: "studentId required" }, { status: 400 });
  }
  if (!body.amount || Number(body.amount) <= 0) {
    return NextResponse.json({ ok: false, error: "amount must be positive" }, { status: 400 });
  }
  const feeType = normalizeFeeType(body.feeType);
  try {
    const row = await addStudentFeeItem({
      studentId: body.studentId,
      feeType,
      amount: body.amount,
      due: body.due,
    });
    try {
      await logAudit(
        actor,
        "Added fee item",
        `${body.studentId} · ${feeTypeLabel(feeType)} · ₹${Number(body.amount).toLocaleString("en-IN")}`
      );
    } catch {}
    return NextResponse.json({ ok: true, fee: row });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}
