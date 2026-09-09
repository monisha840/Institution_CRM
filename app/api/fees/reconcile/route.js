import { NextResponse } from "next/server";
import { studentsMissingTermFees, backfillTermFees, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Admin-only integrity tooling for the "every student recorded term-wise"
// guarantee.
//   GET  → list active students whose term1/2/3 record is incomplete (should
//          be empty). Read-only.
//   POST → conservatively seed term rows for un-seeded students. Safe: skips
//          anyone who still has a legacy single annual row.
const SUPER = new Set(["admin"]);

export async function GET() {
  const session = await getSession();
  if (!session || !SUPER.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  const missing = await studentsMissingTermFees();
  return NextResponse.json({ ok: true, count: missing.length, missing });
}

export async function POST() {
  const session = await getSession();
  if (!session || !SUPER.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  try {
    const result = await backfillTermFees();
    try { await logAudit(session.name || "Admin", "Backfilled term fees", `seeded ${result.seeded.length}, skipped ${result.skipped.length}`); } catch {}
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }
}
