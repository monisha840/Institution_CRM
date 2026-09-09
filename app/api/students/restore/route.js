import { NextResponse } from "next/server";
import { restoreStudent, seedStudentTermFees, logAudit } from "@/lib/db";

// Bring an archived student back to active. Re-creates the full term-wise fee
// record (Term I/II/III, + Application/Van when configured) so they show up in
// Fees & UPI again.
export async function POST(req) {
  let body; try { body = await req.json(); } catch { body = null; }
  const id = body?.id;
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  try {
    const restored = await restoreStudent(id);
    if (!restored) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    try {
      await seedStudentTermFees(restored);
    } catch {}
    try { await logAudit("Rashmi Iyer", "Restored student", `${restored.id} ${restored.name}`); } catch {}
    return NextResponse.json({ ok: true, student: restored });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }
}
