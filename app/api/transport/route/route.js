import { NextResponse } from "next/server";
import { addRoute, removeRoute, updateRoute, logAudit, readAllData, addNotification, listUsers } from "@/lib/db";
import { getSession } from "@/lib/auth";

// When admin/principal assigns or reassigns a teacher to a route, drop an
// in-app notification on the new attendant so they see "you've been put on
// bus R3" the next time they open the app — no need to chase them down.
// Best-effort: never lets a notification failure break the assignment.
async function notifyAttendantAssigned(route, prevAttendant) {
  try {
    const next = (route?.attendant || "").trim();
    const prev = (prevAttendant || "").trim();
    if (!next || next === "—" || next.toLowerCase() === prev.toLowerCase()) return;
    const users = await listUsers();
    const me = next.toLowerCase();
    const target = users.find(
      (u) => u.role === "teacher" && (u.name || "").trim().toLowerCase() === me
    );
    if (!target) return; // attendant might be an external driver with no login
    const dirLabel = route.direction === "evening"
      ? "evening drop"
      : route.direction === "both" ? "morning + evening"
      : "morning pickup";
    const label = route.code + (route.name && route.name !== route.code ? ` · ${route.name}` : "");
    await addNotification({
      userId: target.id,
      type: "transport",
      title: "🚌 You've been assigned to a bus route",
      description: `${label} (${dirLabel}). Open Transport to start the run when the bus rolls out.`,
      redirectUrl: "?screen=transport",
    });
  } catch (e) {
    console.warn(`[transport] attendant-assigned notification failed: ${e.message}`);
  }
}

export async function POST(req) {
  const session = await getSession();
  const actor = session?.name || "Principal";

  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.code?.trim()) {
    return NextResponse.json({ ok: false, error: "Route code is required" }, { status: 400 });
  }
  if (!Array.isArray(body.stops) || body.stops.length === 0) {
    return NextResponse.json({ ok: false, error: "Add at least one stop" }, { status: 400 });
  }
  try {
    const route = await addRoute(body);
    try { await logAudit(actor, "Added transport route", `${route.code} ${route.name}`); } catch {}
    return NextResponse.json({ ok: true, route });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed to add route" }, { status: 500 });
  }
}

// PATCH /api/transport/route { code, name?, driver?, attendant?, bus?, eta?, stops?, status? }
export async function PATCH(req) {
  const session = await getSession();
  const actor = session?.name || "Principal";

  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.code) {
    return NextResponse.json({ ok: false, error: "code required" }, { status: 400 });
  }
  if ("stops" in body && (!Array.isArray(body.stops) || body.stops.length === 0)) {
    return NextResponse.json({ ok: false, error: "Stops list cannot be empty" }, { status: 400 });
  }
  try {
    // Snapshot the prior attendant before the update so we can detect
    // assignment changes and notify the newly-assigned teacher below.
    let prevAttendant = null;
    if ("attendant" in body) {
      try {
        const snap = await readAllData();
        const old = (snap.routes || []).find((r) => r.code === body.code);
        prevAttendant = old?.attendant || null;
      } catch {}
    }
    const route = await updateRoute(body.code, body);
    if (!route) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    try { await logAudit(actor, "Updated transport route", `${route.code} ${route.name || ""}`); } catch {}
    if ("attendant" in body) {
      await notifyAttendantAssigned(route, prevAttendant);
    }
    return NextResponse.json({ ok: true, route });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}

export async function DELETE(req) {
  const session = await getSession();
  const actor = session?.name || "Principal";

  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.code) {
    return NextResponse.json({ ok: false, error: "code required" }, { status: 400 });
  }
  const removed = await removeRoute(body.code);
  if (!removed) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  try { await logAudit(actor, "Removed transport route", `${removed.code} ${removed.name}`); } catch {}
  return NextResponse.json({ ok: true });
}
