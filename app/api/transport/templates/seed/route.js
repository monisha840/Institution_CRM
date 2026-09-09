import { NextResponse } from "next/server";
import { seedRouteTemplates, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

// POST /api/transport/templates/seed → bulk-insert R1-R6 from the school's
// master PDF. Idempotent: existing templates are skipped, not overwritten.
// Admin-only — this is a one-shot setup action, not something principal
// should run repeatedly.
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  if (session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Only admin can seed templates" }, { status: 403 });
  }
  try {
    const result = await seedRouteTemplates();
    try {
      await logAudit(
        session.name || "Admin",
        "Seeded route templates",
        `created ${result.created.length} · skipped ${result.skipped.length} · total ${result.total}`
      );
    } catch {}
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}
