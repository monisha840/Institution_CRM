import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { readAllData, provisionParentLogin, logAudit } from "@/lib/db";
import { supabase, supabaseEnabled } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Admin-only.
// Wipes every parent user account and re-creates one fresh login per
// current student so the email / password follow the deterministic
// "parent.{slug(name)}@sanfort.com" + "{FirstName}@123" scheme.
//
// Use when stale parent users from earlier imports are colliding with
// freshly-imported students (e.g. random STN-XXXX IDs got reused and
// the old parent rows are winning the linkedId lookup on the Users &
// Roles screen). Idempotent — safe to re-run, always converges to one
// parent per current student with the canonical naming.
//
// Returns the full credentials array so the UI can offer a CSV
// download right after the call (passwords are hashed in storage and
// can't be retrieved later).
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  if (session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  }

  // Pull the current state of the school: students + everything else.
  const db = await readAllData();
  const students = Array.isArray(db.addedStudents) ? db.addedStudents : [];

  // 1. Wipe every parent user. On Supabase this is a single DELETE;
  //    on the file-store fallback we filter authUsers in place.
  let wipedCount = 0;
  if (supabaseEnabled) {
    const sel = await supabase.from("users").select("id", { count: "exact" }).eq("role", "parent");
    wipedCount = sel.count || 0;
    const del = await supabase.from("users").delete().eq("role", "parent");
    if (del.error) {
      return NextResponse.json({ ok: false, error: `wipe failed: ${del.error.message}` }, { status: 500 });
    }
  } else {
    // File-store path — used by `npm run dev` when SUPABASE env vars aren't set.
    const fs = require("node:fs");
    const path = require("node:path");
    const dbPath = path.resolve(process.cwd(), "data", "db.json");
    if (fs.existsSync(dbPath)) {
      const raw = JSON.parse(fs.readFileSync(dbPath, "utf8"));
      const before = (raw.authUsers || []).length;
      raw.authUsers = (raw.authUsers || []).filter((u) => u.role !== "parent");
      wipedCount = before - raw.authUsers.length;
      fs.writeFileSync(dbPath, JSON.stringify(raw, null, 2));
    }
  }

  // 2. Loop through every student and provision a fresh parent login.
  //    Failures don't abort — we collect them so the admin can retry
  //    the few that failed via the Issue Login button on the Students
  //    screen. Most failures are duplicate-email collisions which
  //    deriveParentEmail already handles by appending the student id.
  const logins = [];
  const errors = [];
  for (const s of students) {
    try {
      const cred = await provisionParentLogin({
        studentId: s.id,
        studentName: s.name,
        parentEmail: null,
      });
      if (cred) {
        logins.push({
          studentId: s.id,
          studentName: s.name,
          cls: s.cls,
          email: cred.email,
          password: cred.defaultPassword,
        });
      } else {
        // Returned null — email collision, dedupe path already inside
        // provisionParentLogin should prevent this for clean wipes.
        errors.push({ studentId: s.id, name: s.name, reason: "email already in use after wipe" });
      }
    } catch (e) {
      errors.push({ studentId: s.id, name: s.name, reason: e.message || "Failed" });
    }
  }

  try {
    await logAudit(
      session.name || "Admin",
      "Backfilled parent logins",
      `wiped=${wipedCount} · created=${logins.length}${errors.length ? ` · ${errors.length} failed` : ""}`
    );
  } catch {}

  return NextResponse.json({
    ok: true,
    wiped: wipedCount,
    created: logins.length,
    failed: errors.length,
    logins,
    errors,
  });
}
