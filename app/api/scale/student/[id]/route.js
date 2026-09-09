import { NextResponse } from "next/server";
import { listScaleEntries, readSettings, readAllData } from "@/lib/db";
import {
  computeProfile, bandFor, compositeBand,
  SCALE_DEFAULT_DOMAIN_WEIGHTS,
} from "@/lib/scale";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/scale/student/{id}?dateFrom=…&dateTo=…
//
// Returns the computed SCALE profile for a single student over the
// given date window (defaults to all-time). Parents can only fetch
// their own child; teachers their own class students; admin /
// principal / academic_director anyone.
export async function GET(req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });

  const studentId = params.id;
  if (!studentId) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  // Authorisation — make sure the caller is allowed to see this student.
  let student = null;
  try {
    const data = await readAllData();
    student = (data.addedStudents || []).find((s) => s.id === studentId) || null;
    if (!student) return NextResponse.json({ ok: false, error: "Student not found" }, { status: 404 });

    if (session.role === "parent") {
      if (session.linkedId !== studentId) {
        return NextResponse.json({ ok: false, error: "Not your child" }, { status: 403 });
      }
    } else if (session.role === "teacher") {
      const myClasses = new Set(Array.isArray(session.linkedClasses) ? session.linkedClasses : []);
      if (myClasses.size > 0 && !myClasses.has(student.cls)) {
        return NextResponse.json({ ok: false, error: "Student not in your class" }, { status: 403 });
      }
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }

  const url = new URL(req.url);
  const dateFrom = url.searchParams.get("dateFrom") || undefined;
  const dateTo   = url.searchParams.get("dateTo")   || undefined;

  // Active composite weights (admin override or defaults).
  let weights = SCALE_DEFAULT_DOMAIN_WEIGHTS;
  try {
    const settings = await readSettings();
    const w = settings?.scale?.weights;
    if (w && typeof w === "object") {
      const merged = { ...SCALE_DEFAULT_DOMAIN_WEIGHTS };
      for (const k of Object.keys(merged)) {
        const v = Number(w[k]);
        if (Number.isFinite(v) && v >= 0) merged[k] = v;
      }
      weights = merged;
    }
  } catch {}

  const entries = await listScaleEntries({ studentId, dateFrom, dateTo, limit: 5000 });
  const profile = computeProfile(entries, weights);

  // Decorate with band labels so the client doesn't have to repeat the
  // logic. Each domain entry has { score, band: { label, tone } }.
  const perDomainBanded = {};
  for (const k of Object.keys(profile.perDomain)) {
    perDomainBanded[k] = { score: profile.perDomain[k], band: bandFor(profile.perDomain[k]) };
  }

  return NextResponse.json({
    ok: true,
    student: { id: student.id, name: student.name, cls: student.cls },
    weights,
    entriesCount: entries.length,
    composite: profile.composite,
    compositeBand: compositeBand(profile.composite),
    perDomain: perDomainBanded,
    perIndicator: profile.perIndicator,
    dateRange: { from: dateFrom || null, to: dateTo || null },
  });
}
