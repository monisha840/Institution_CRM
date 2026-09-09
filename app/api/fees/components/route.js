import { NextResponse } from "next/server";
import { setStudentFeeComponents, addActivity, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

// POST /api/fees/components { id, term1?, term2?, term3?, application?, transport? }
// Sets a student's fee breakdown. Each supplied component replaces that
// outstanding pending amount (0 clears it); the student's overall fee is the
// sum of all five. Parents are read-only; any other staff role may edit.
const COMPONENTS = ["term1", "term2", "term3", "application", "transport"];

export async function POST(req) {
  const session = await getSession();
  if (session?.role === "parent") {
    return NextResponse.json(
      { ok: false, error: "Only school staff can edit fees." },
      { status: 403 }
    );
  }
  const actor = session?.name || "Staff";

  let body; try { body = await req.json(); } catch { body = null; }
  const id = body?.id;
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const components = {};
  for (const k of COMPONENTS) {
    if (body[k] == null || body[k] === "") continue;
    const n = Math.floor(Number(body[k]));
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ ok: false, error: `${k} must be 0 or more` }, { status: 400 });
    }
    components[k] = n;
  }
  if (Object.keys(components).length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
  }

  let result;
  try {
    result = await setStudentFeeComponents({ studentId: id, components, actor });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }

  try {
    await addActivity({
      t: "fee", tone: "warn",
      title: `Fee breakdown updated · ${id}`,
      sub: `overall ₹${result.overall.toLocaleString("en-IN")}`,
      ts: "now",
    });
  } catch {}
  try {
    await logAudit(actor, "Edited fee breakdown", `${id} · overall ₹${result.overall.toLocaleString("en-IN")}`);
  } catch {}

  return NextResponse.json({ ok: true, ...result });
}
