import { NextResponse } from "next/server";
import { getFeeStructure, setFeeStructure, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

// The per-class fee schedule (term1/2/3 + application + van). Any non-parent
// staff role may READ it; only admin, principal and the school accountant may
// EDIT it.
const STAFF = new Set([
  "admin", "principal", "academic_director", "school_accountant", "trust_accountant",
]);
const EDITORS = new Set(["admin", "principal", "school_accountant"]);

// GET /api/fees/structure → { ok, structure: { perClass: { "<n>": {...} } } }
export async function GET() {
  const session = await getSession();
  if (!session || !STAFF.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  const structure = await getFeeStructure();
  return NextResponse.json({ ok: true, structure });
}

// PUT /api/fees/structure { structure: { perClass: { "<n>": { term1, term2, term3, application, van } } } }
export async function PUT(req) {
  const session = await getSession();
  if (!session || !EDITORS.has(session.role)) {
    return NextResponse.json(
      { ok: false, error: "Only admin, principal or the school accountant can edit the fee structure." },
      { status: 403 }
    );
  }
  let body; try { body = await req.json(); } catch { body = null; }
  try {
    const structure = await setFeeStructure(body?.structure || body);
    const classes = Object.keys(structure.perClass || {}).length;
    try { await logAudit(session.name || "Admin", "Updated fee structure", `${classes} class${classes === 1 ? "" : "es"} configured`); } catch {}
    return NextResponse.json({ ok: true, structure });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }
}
