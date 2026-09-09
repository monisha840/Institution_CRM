import { NextResponse } from "next/server";
import {
  listSupportPlans, upsertSupportPlan,
  logAudit, readAllData,
} from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const WRITE_ROLES = new Set(["admin", "principal", "academic_director", "teacher"]);

// GET /api/scale/support-plans?studentId=…&status=active
export async function GET(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  const url = new URL(req.url);
  const studentId = url.searchParams.get("studentId") || undefined;
  const status    = url.searchParams.get("status")    || undefined;

  let items = await listSupportPlans({ studentId, status, limit: 200 });

  // Teacher: scope to their assigned class students.
  if (session.role === "teacher") {
    const data = await readAllData();
    const myClasses = new Set(Array.isArray(session.linkedClasses) ? session.linkedClasses : []);
    const studentIds = new Set(
      (data.addedStudents || []).filter((s) => myClasses.has(s.cls)).map((s) => s.id)
    );
    items = items.filter((p) => studentIds.has(p.studentId));
  }
  // Parent: only their child.
  if (session.role === "parent") {
    items = items.filter((p) => p.studentId === session.linkedId);
  }

  return NextResponse.json({ ok: true, items });
}

// POST /api/scale/support-plans  — create/update by student+term.
// Enforces the sequenced-step rule: currentStep can only advance if the
// previous step has substantive content. Step 4 (strength plan) and
// step 5 (referral) cannot be reached without steps 1+2 documented.
export async function POST(req) {
  const session = await getSession();
  if (!session || !WRITE_ROLES.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.studentId) return NextResponse.json({ ok: false, error: "studentId required" }, { status: 400 });

  const requestedStep = Math.max(1, Math.min(5, Number(body.currentStep) || 1));

  // Step gating — refuse to advance past step 1 unless root_cause has
  // a category, and past step 3 unless domain_advisory has actions.
  const rootDone = !!(body.rootCause && body.rootCause.category);
  const advisoryDone = Array.isArray(body.domainAdvisory?.actions) && body.domainAdvisory.actions.length > 0;
  if (requestedStep >= 2 && !rootDone) {
    return NextResponse.json(
      { ok: false, error: "Document a root cause (step 1) before advancing." },
      { status: 400 }
    );
  }
  if (requestedStep >= 4 && !advisoryDone) {
    return NextResponse.json(
      { ok: false, error: "Step 4 (strength scheduling) requires domain advisory (step 2) to be filled. Don't skip ahead." },
      { status: 400 }
    );
  }
  if (requestedStep >= 5 && !advisoryDone) {
    return NextResponse.json(
      { ok: false, error: "Specialist referral (step 5) requires steps 1 and 2 to be documented first. Root-cause first, always." },
      { status: 400 }
    );
  }

  let saved;
  try {
    saved = await upsertSupportPlan({ ...body, createdBy: session.sub });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }

  try {
    await logAudit(
      session.name || "User",
      "Updated SCALE support plan",
      `${saved.id} · step ${saved.currentStep} · status ${saved.status}`
    );
  } catch {}

  return NextResponse.json({ ok: true, plan: saved });
}
