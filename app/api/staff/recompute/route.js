import { NextResponse } from "next/server";
import { recomputeStaffPerformance, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

// POST /api/staff/recompute { id }
// Pulls the teacher's real signals (own attendance, students' performance,
// contribution to school) and rewrites their attendance / tasks / score /
// status. Returns the breakdown so the UI can show what fed the score.
export async function POST(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  if (!["principal", "admin"].includes(session.role)) {
    return NextResponse.json({ ok: false, error: "Only principal or admin can recompute" }, { status: 403 });
  }

  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const updated = await recomputeStaffPerformance(body.id);
  if (!updated) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  try {
    const b = updated.breakdown || {};
    await logAudit(
      session.name || "Principal",
      "Recomputed staff performance",
      `${updated.id} ${updated.name} · own ${b.attendance?.score}% · students ${b.student?.score}% · contribution ${b.contribution?.score}% · score ${updated.score}`,
    );
  } catch {}
  return NextResponse.json({ ok: true, staff: updated });
}
