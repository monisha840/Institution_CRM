import { NextResponse } from "next/server";
import { getStudentReport } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/students/<id>/report — full 360° detail for one student.
// Staff see any student; a parent may only pull their own linked child.
export async function GET(req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const id = params?.id;
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  if (session.role === "parent" && session.linkedId && session.linkedId !== id) {
    return NextResponse.json({ ok: false, error: "Not your child" }, { status: 403 });
  }
  try {
    const report = await getStudentReport(id);
    if (!report.student) return NextResponse.json({ ok: false, error: "Student not found" }, { status: 404 });
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}
