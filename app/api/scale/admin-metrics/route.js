import { NextResponse } from "next/server";
import {
  listScaleSessions, listScaleEntries, readAllData, readSettings,
} from "@/lib/db";
import { computeProfile, SCALE_DEFAULT_DOMAIN_WEIGHTS } from "@/lib/scale";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const REVIEW_ROLES = new Set(["admin", "principal", "academic_director"]);

// GET /api/scale/admin-metrics?days=30
//
// Returns the four SCALE-derived admin evaluation metrics from the
// chat spec, plus the list of weaker students (composite < 55) so the
// support workflow has a triage queue.
export async function GET(req) {
  const session = await getSession();
  if (!session || !REVIEW_ROLES.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }
  const url = new URL(req.url);
  const days = Math.max(7, Math.min(365, Number(url.searchParams.get("days") || 30)));
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  const [sessions, entries, data] = await Promise.all([
    listScaleSessions({ dateFrom: since, limit: 1000 }),
    listScaleEntries({ limit: 5000 }),
    readAllData(),
  ]);

  // Active composite weights.
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

  // ---- Metric 1: Register submission rate ----
  // Sessions submitted on the day of the lesson, vs total sessions in
  // window. "On time" = created_at within 24h of session_date.
  let onTime = 0;
  for (const s of sessions) {
    if (!s.sessionDate || !s.createdAt) continue;
    const sd = new Date(`${s.sessionDate}T23:59:59`).getTime();
    const ca = new Date(s.createdAt).getTime();
    if (Math.abs(ca - sd) <= 86_400_000) onTime++;
  }
  const registerSubmissionRate = sessions.length === 0
    ? null
    : Math.round((onTime / sessions.length) * 100);

  // ---- Metric 2: Lesson plans on time ----
  // Pre-checklist's `lessonPlan` flag was true on submission. Same window.
  let plansOnTime = 0;
  for (const s of sessions) {
    if (s.preChecklist?.lessonPlan === true) plansOnTime++;
  }
  const lessonPlansOnTime = sessions.length === 0
    ? null
    : Math.round((plansOnTime / sessions.length) * 100);

  // ---- Metric 3: Class average composite ----
  // Compute per-student composite from entries in the window, then
  // group by class. Returns top-line average + per-class breakdown.
  const dateFrom = new Date(Date.now() - days * 86_400_000).toISOString();
  const inWindow = entries.filter((e) => (e.createdAt || "") >= dateFrom);
  const studentEntries = new Map();
  for (const e of inWindow) {
    if (!studentEntries.has(e.studentId)) studentEntries.set(e.studentId, []);
    studentEntries.get(e.studentId).push(e);
  }
  const studentComposites = []; // [{ id, name, cls, composite }]
  for (const [sid, list] of studentEntries) {
    const stu = (data.addedStudents || []).find((s) => s.id === sid);
    if (!stu) continue;
    const profile = computeProfile(list, weights);
    if (profile.composite == null) continue;
    studentComposites.push({ id: sid, name: stu.name, cls: stu.cls, composite: profile.composite });
  }

  const classAverages = (() => {
    const map = new Map();
    for (const r of studentComposites) {
      if (!map.has(r.cls)) map.set(r.cls, { cls: r.cls, sum: 0, n: 0 });
      const m = map.get(r.cls);
      m.sum += r.composite; m.n += 1;
    }
    return Array.from(map.values())
      .map((m) => ({ cls: m.cls, average: Math.round(m.sum / m.n), students: m.n }))
      .sort((a, b) => a.cls.localeCompare(b.cls));
  })();
  const overallClassAverage = studentComposites.length === 0
    ? null
    : Math.round(studentComposites.reduce((a, r) => a + r.composite, 0) / studentComposites.length);

  // ---- Metric 4: Weaker students flagged ----
  // Composite < 55 (the "On track · attention needed" / "At risk"
  // threshold). The support-plan workflow consumes this list.
  const weaker = studentComposites
    .filter((r) => r.composite < 55)
    .sort((a, b) => a.composite - b.composite);

  return NextResponse.json({
    ok: true,
    windowDays: days,
    sessionsCount: sessions.length,
    metrics: {
      registerSubmissionRate,
      lessonPlansOnTime,
      classAverage: overallClassAverage,
      weakerStudentsFlagged: weaker.length,
    },
    classAverages,
    weakerStudents: weaker.slice(0, 50),
  });
}
