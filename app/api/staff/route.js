import { NextResponse } from "next/server";
import { addStaff, archiveStaff, updateStaffPerformance, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

// 10-digit Indian mobile: must start with 6/7/8/9. Returns formatted "+91 XXXXX XXXXX" or null.
function formatIndianPhone(raw) {
  if (!raw) return "—";
  let digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  if (digits.length !== 10 || !/^[6-9]/.test(digits)) return null;
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

export async function POST(req) {
  const session = await getSession();
  const actor = session?.name || "Principal";

  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.name?.trim()) {
    return NextResponse.json({ ok: false, error: "Name is required" }, { status: 400 });
  }
  let phone = "—";
  if (body.phone && String(body.phone).trim() && String(body.phone).trim() !== "—") {
    const formatted = formatIndianPhone(body.phone);
    if (formatted === null) {
      return NextResponse.json(
        { ok: false, error: "Phone must be a 10-digit Indian mobile starting with 6/7/8/9" },
        { status: 400 }
      );
    }
    phone = formatted;
  }
  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email).trim())) {
    return NextResponse.json({ ok: false, error: "Invalid email address" }, { status: 400 });
  }

  const role = ["Teacher", "Ops", "Intern"].includes(body.role) ? body.role : "Teacher";
  const salary = Math.max(0, Number(body.salary) || 0);
  const attendance = Math.min(100, Math.max(0, Number(body.attendance) || 0));
  const tasks = Math.min(100, Math.max(0, Number(body.tasks) || 0));

  try {
    const staff = await addStaff({
      name: body.name.trim(),
      role,
      dept: body.dept || (role === "Teacher" ? "Academics" : role === "Ops" ? "Operations" : "Internship"),
      phone,
      email: body.email ? String(body.email).trim() : null,
      joiningDate: body.joiningDate || undefined,
      salary,
      attendance,
      tasks,
    });
    try { await logAudit(actor, "Hired staff", `${staff.id} ${staff.name} · ${staff.role}`); } catch {}
    // Pull off the auto-provisioned login (if any) so the screen can show
    // the principal the default password to share with the teacher.
    const { createdLogin, ...staffOnly } = staff;
    if (createdLogin) {
      try {
        await logAudit(actor, "Provisioned teacher login",
          `${staff.email} · default password reset advised on first sign-in`);
      } catch {}
    }
    return NextResponse.json({ ok: true, staff: staffOnly, createdLogin });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed to add staff" }, { status: 500 });
  }
}

// PATCH /api/staff { id, attendance?, tasks?, salary? }
// Updates a staff member's performance metrics. Recomputes the composite
// score + status server-side so the leaderboard never drifts out of sync
// with the underlying numbers.
export async function PATCH(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  if (!["principal", "admin"].includes(session.role)) {
    return NextResponse.json({ ok: false, error: "Only principal or admin can update performance" }, { status: 403 });
  }
  const actor = session.name || "Principal";

  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const patch = {};
  if ("attendance" in body) patch.attendance = body.attendance;
  if ("tasks" in body)      patch.tasks      = body.tasks;
  if ("salary" in body)     patch.salary     = body.salary;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
  }

  const updated = await updateStaffPerformance(body.id, patch);
  if (!updated) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  try {
    const trail = [];
    if ("attendance" in patch) trail.push(`attendance=${patch.attendance}%`);
    if ("tasks" in patch)      trail.push(`tasks=${patch.tasks}%`);
    if ("salary" in patch)     trail.push(`salary=₹${patch.salary}`);
    await logAudit(actor, "Updated staff performance", `${updated.id} ${updated.name} · ${trail.join(" · ")} · score ${updated.score}`);
  } catch {}
  return NextResponse.json({ ok: true, staff: updated });
}

export async function DELETE(req) {
  const session = await getSession();
  const actor = session?.name || "Principal";

  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id) {
    return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  }
  const removed = await archiveStaff(body.id);
  if (!removed) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  try { await logAudit(actor, "Removed staff", `${removed.id} ${removed.name}`); } catch {}
  return NextResponse.json({ ok: true });
}
