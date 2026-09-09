import { NextResponse } from "next/server";
import { setUserPassword, getUserByEmail, logAudit, listUsers } from "@/lib/db";
import { hashPassword, getSession } from "@/lib/auth";

// 12-char alphanumeric password — avoids ambiguous chars (0/O/1/l/I) so the
// admin can read it back over a phone call without confusion. The plain text
// is returned ONCE in the response and never persisted.
function generatePassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// POST /api/users/reset-password  { id?, email?, password? }
//   Admin-only. Replaces the bcrypt hash on a user record with a fresh one.
//   If `password` is omitted, generates a random 12-char password.
//   Returns: { ok, user, password }  — the plain password is only returned
//   here, never re-fetched.
export async function POST(req) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Only admin can reset passwords" }, { status: 403 });
  }

  let body; try { body = await req.json(); } catch { body = null; }
  const id    = body?.id ? String(body.id).trim() : "";
  const email = body?.email ? String(body.email).trim().toLowerCase() : "";
  const supplied = typeof body?.password === "string" ? body.password : "";

  if (!id && !email) {
    return NextResponse.json({ ok: false, error: "id or email required" }, { status: 400 });
  }
  if (supplied && supplied.length < 6) {
    return NextResponse.json({ ok: false, error: "Password must be at least 6 characters" }, { status: 400 });
  }

  // Resolve the target user. Prefer id; fall back to email.
  let target = null;
  try {
    if (id) {
      const all = await listUsers();
      target = all.find((u) => u.id === id) || null;
    }
    if (!target && email) {
      target = await getUserByEmail(email);
    }
  } catch {}
  if (!target) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  // Don't let an admin lock themselves out unintentionally — confirm it's
  // a deliberate self-reset by requiring an explicit password to be supplied.
  if (target.id === session.sub && !supplied) {
    return NextResponse.json(
      { ok: false, error: "Pass an explicit password when resetting your own account" },
      { status: 400 }
    );
  }

  const plain = supplied || generatePassword();
  let updated;
  try {
    const passwordHash = await hashPassword(plain);
    updated = await setUserPassword(target.id, passwordHash);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed to reset password" }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ ok: false, error: "User row not writeable" }, { status: 500 });
  }

  try {
    await logAudit(session.name || "Admin", "Reset user password",
      `${updated.id} · ${updated.email} · role=${updated.role}`);
  } catch {}

  // Strip any hash-shaped fields before returning.
  const { hashedPassword, password, passwordHash, ...safe } = updated;
  return NextResponse.json({ ok: true, user: safe, password: plain });
}
