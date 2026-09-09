import { NextResponse } from "next/server";
import { setStopBoarding, logAudit } from "@/lib/db";

export async function POST(req) {
  let body; try { body = await req.json(); } catch { body = null; }
  const { code, stopName, action } = body || {};
  if (!code || !stopName || !action) {
    return NextResponse.json({ ok: false, error: "code+stopName+action required" }, { status: 400 });
  }
  try {
    const route = await setStopBoarding(code, stopName, action);
    if (!route) return NextResponse.json({ ok: false, error: "Route or stop not found" }, { status: 404 });
    try { await logAudit(`${route.driver} (driver)`, `Marked ${action}`, `${route.code} · ${stopName}`); } catch {}
    return NextResponse.json({ ok: true, route });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }
}
