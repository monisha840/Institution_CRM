import { NextResponse } from "next/server";
import { addStaffAward, removeStaffAward, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

// POST /api/staff/awards { staffId, title, citation?, category?, awardedAt? }
// Adds an award to a staff member. Recognised categories:
// recognition | attendance | academic | service.
export async function POST(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  if (!["principal", "admin"].includes(session.role)) {
    return NextResponse.json({ ok: false, error: "Only principal or admin can issue awards" }, { status: 403 });
  }
  const actor = session.name || "Principal";

  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.staffId) return NextResponse.json({ ok: false, error: "staffId required" }, { status: 400 });
  if (!body?.title?.trim()) return NextResponse.json({ ok: false, error: "Award title is required" }, { status: 400 });

  let award;
  try {
    award = await addStaffAward({
      staffId: body.staffId,
      title: body.title,
      citation: body.citation,
      category: body.category,
      awardedAt: body.awardedAt,
      awardedBy: actor,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }

  try {
    await logAudit(actor, "Issued staff award", `${award.staffName || award.staffId} · ${award.title}`);
  } catch {}
  return NextResponse.json({ ok: true, award });
}

// DELETE /api/staff/awards { id }
// Revokes an award. Permanent — there's no soft-delete on awards.
export async function DELETE(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  if (!["principal", "admin"].includes(session.role)) {
    return NextResponse.json({ ok: false, error: "Only principal or admin can revoke awards" }, { status: 403 });
  }
  const actor = session.name || "Principal";

  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const removed = await removeStaffAward(body.id);
  if (!removed) return NextResponse.json({ ok: false, error: "Award not found" }, { status: 404 });

  try {
    await logAudit(actor, "Revoked staff award", `${removed.staffName || removed.staffId} · ${removed.title}`);
  } catch {}
  return NextResponse.json({ ok: true });
}
