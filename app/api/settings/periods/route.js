import { NextResponse } from "next/server";
import { readPeriodTimes, writePeriodTimes, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Period start/end times are a whole-school setting. Every signed-in role can
// READ them (the timetable grid renders them for parents and teachers too),
// but only the super admin (`admin` role) may customize them.
const SUPER = new Set(["admin"]);

// GET /api/settings/periods → { ok, periods: [{ period, start, end }] }
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const periods = await readPeriodTimes();
  return NextResponse.json({ ok: true, periods });
}

// PUT /api/settings/periods { periods: [{ period, start, end }] }
// Admin-only. Replaces the whole-school period timing list.
export async function PUT(req) {
  const session = await getSession();
  if (!session || !SUPER.has(session.role)) {
    return NextResponse.json(
      { ok: false, error: "Only the admin can customize period timings." },
      { status: 403 }
    );
  }
  let body; try { body = await req.json(); } catch { body = null; }
  try {
    const periods = await writePeriodTimes(body?.periods);
    try { await logAudit(session.name || "Admin", "Updated period timings", `${periods.length} periods`); } catch {}
    return NextResponse.json({ ok: true, periods });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }
}
