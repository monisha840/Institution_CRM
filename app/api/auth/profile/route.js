import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getSession, verifyPassword, signSession,
  SESSION_COOKIE, SESSION_TTL_SECONDS,
} from "@/lib/auth";
import { getUserByEmail, updateMyProfile, readAllData, logAudit } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/auth/profile — full self profile, including the read-only
// fields surfaced on the My Account page (email, phone, role, etc).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });

  // Resolve phone via the linked record. Teachers' phones live on the
  // staff row (matched by email); parents' phones live as the contact
  // string on their child's student row. There's no general user.phone
  // column — by design, phone is record-shaped, not account-shaped.
  let phone = null;
  try {
    const data = await readAllData();
    if (session.role === "parent" && session.linkedId) {
      const child = (data.addedStudents || []).find((s) => s.id === session.linkedId);
      if (child) phone = child.parent || null;
    } else if (session.email) {
      const me = (data.staff || []).find((s) => (s.email || "").toLowerCase() === session.email.toLowerCase());
      if (me) phone = me.phone || null;
    }
  } catch {}

  return NextResponse.json({
    ok: true,
    profile: {
      id: session.sub,
      name: session.name,
      email: session.email,
      role: session.role,
      phone: phone || null,
      linkedId: session.linkedId || null,
      linkedClasses: Array.isArray(session.linkedClasses) ? session.linkedClasses : [],
    },
  });
}

// PATCH /api/auth/profile { name?, email?, currentPassword?, newPassword? }
//
// Self-service edit. Phone is still NOT editable here (lives on the staff
// or student record and is admin-managed). Email IS editable — the new
// value is mirrored onto the linked staff row so a teacher's account
// stays in sync with their staff record.
//
// To set a new password, the user must verify their current one (or be
// using the demo seed which doesn't have a hash yet — first-set is
// allowed in that case).
export async function PATCH(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });

  let body; try { body = await req.json(); } catch { body = null; }
  const wantsName = typeof body?.name === "string" && body.name.trim() && body.name.trim() !== session.name;
  const newEmailNorm = typeof body?.email === "string" ? body.email.trim().toLowerCase() : null;
  const wantsEmail = !!newEmailNorm && newEmailNorm !== String(session.email || "").toLowerCase();
  const wantsPassword = typeof body?.newPassword === "string" && body.newPassword.length > 0;

  if (!wantsName && !wantsEmail && !wantsPassword) {
    return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
  }

  // Validate name
  if (wantsName) {
    const n = body.name.trim();
    if (n.length < 2)  return NextResponse.json({ ok: false, error: "Name is too short" }, { status: 400 });
    if (n.length > 60) return NextResponse.json({ ok: false, error: "Name is too long" }, { status: 400 });
  }

  // Validate email format up front so we don't bother hitting the DB on
  // an obviously bad value. The deeper uniqueness check happens inside
  // updateMyProfile.
  if (wantsEmail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmailNorm)) {
      return NextResponse.json({ ok: false, error: "Email format is invalid" }, { status: 400 });
    }
    if (newEmailNorm.length > 120) {
      return NextResponse.json({ ok: false, error: "Email is too long" }, { status: 400 });
    }
  }

  // If password change requested, verify the current one against the
  // stored hash. Demo accounts that haven't set a real password yet skip
  // the check (their hash is empty / null).
  if (wantsPassword) {
    if (typeof body.newPassword !== "string" || body.newPassword.length < 6) {
      return NextResponse.json({ ok: false, error: "New password must be at least 6 characters" }, { status: 400 });
    }
    const user = await getUserByEmail(session.email);
    if (user?.passwordHash) {
      if (!body.currentPassword) {
        return NextResponse.json({ ok: false, error: "Current password is required" }, { status: 400 });
      }
      const ok = await verifyPassword(body.currentPassword, user.passwordHash);
      if (!ok) return NextResponse.json({ ok: false, error: "Current password is incorrect" }, { status: 401 });
    }
  }

  let updated;
  try {
    updated = await updateMyProfile(session.sub, {
      name:        wantsName     ? body.name.trim() : null,
      email:       wantsEmail    ? newEmailNorm    : null,
      newPassword: wantsPassword ? body.newPassword : null,
    });
  } catch (e) {
    const msg = e.message || "Failed";
    const code = /already in use|invalid/i.test(msg) ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
  if (!updated) return NextResponse.json({ ok: false, error: "Account not found" }, { status: 404 });

  // Re-issue the JWT so the topbar / sidebar / dashboard greeting and
  // sign-in identity all pick up the new name/email immediately, without
  // a sign-out.
  if (wantsName || wantsEmail) {
    const token = await signSession({
      sub: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      linkedId: updated.linkedId || null,
      linkedClasses: Array.isArray(updated.linkedClasses) ? updated.linkedClasses : [],
    });
    cookies().set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
  }

  try {
    const trail = [];
    if (wantsName)     trail.push(`name=${updated.name}`);
    if (wantsEmail)    trail.push(`email=${updated.email}`);
    if (wantsPassword) trail.push("password changed");
    await logAudit(updated.name || updated.email, "Updated profile", trail.join(" · "));
  } catch {}

  return NextResponse.json({
    ok: true,
    profile: {
      id: updated.id, name: updated.name, email: updated.email, role: updated.role,
      linkedId: updated.linkedId || null,
      linkedClasses: Array.isArray(updated.linkedClasses) ? updated.linkedClasses : [],
    },
  });
}
