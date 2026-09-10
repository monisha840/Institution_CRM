import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserByEmail, logAudit, readAllData, updateUser, listCustomRoles } from "@/lib/db";
import { runAsTenant, TENANT_HINT_COOKIE } from "@/lib/tenant-context";
import { normalizeTenant, tenantConfig } from "@/lib/tenants";
import {
  verifyPassword, signSession, ROLE_KEYS,
  SESSION_COOKIE, SESSION_TTL_SECONDS,
} from "@/lib/auth";

// Sign in to one institution.
//
// The tenant is part of the credential. Accounts live inside an institution,
// not above it, so the same address could exist in both and still be two
// unrelated people — which is why every lookup below runs inside
// runAsTenant() and the resolved tenant is signed into the session.
//
// There is no credential fallback of any kind. Authentication reads the
// users table; if that read fails, sign-in fails. An earlier build fell back
// to an in-memory account list whenever the database was unreachable, which
// meant a transient Supabase error would hand out a full admin session to
// anyone who knew the seed password.
export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { body = null; }

  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  const tenant = normalizeTenant(body?.tenant);

  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "Email and password are required" }, { status: 400 });
  }

  // One generic message for every rejection below. Distinguishing "no such
  // account" from "wrong password" would confirm which addresses are real at
  // each institution.
  const reject = () =>
    NextResponse.json({ ok: false, error: "Invalid email or password" }, { status: 401 });

  const result = await runAsTenant(tenant, async () => {
    let user;
    try {
      user = await getUserByEmail(email);
    } catch (e) {
      // A database failure is an outage, not a bad credential. Say so, and
      // let it surface as a 503 rather than a silent "wrong password" that
      // sends the user hunting for a typo that isn't there.
      console.error("[login] user lookup failed:", e?.message);
      return { outage: true };
    }
    if (!user || !user.passwordHash) return { rejected: true };

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return { rejected: true };

    // Accept any of the canonical roles OR a real custom-role id. Custom
    // roles created on the Custom Roles screen have ids like
    // "role-office-zgp5", so look them up rather than rejecting outright.
    if (!ROLE_KEYS.includes(user.role)) {
      let customOk = false;
      try {
        const custom = await listCustomRoles();
        customOk = custom.some((r) => r.id === user.role);
      } catch {}
      if (!customOk) return { noRole: true };
    }

    // Parent auto-link: a guardian account with no linkedId (or one pointing
    // at an archived student) is re-pointed at an active student so the
    // child-scoped screens always have a target. Scoped to this tenant, so a
    // school guardian can never be linked to a college student.
    if (user.role === "parent") {
      try {
        const data = await readAllData();
        const active = (data.addedStudents || []).filter(
          (s) => (s.status ?? "active") !== "archived"
        );
        const linkedExists = user.linkedId && active.some((s) => s.id === user.linkedId);
        if (!linkedExists && active.length > 0) {
          await updateUser(user.id, { linkedId: active[0].id }).catch(() => {});
          user = { ...user, linkedId: active[0].id };
        }
      } catch {}
    }

    return { user };
  });

  if (result.outage) {
    return NextResponse.json(
      { ok: false, error: "We can't reach the sign-in service right now. Please try again in a moment." },
      { status: 503 }
    );
  }
  if (result.rejected) return reject();
  if (result.noRole) {
    return NextResponse.json({ ok: false, error: "Account has no valid role" }, { status: 403 });
  }

  const { user } = result;

  // The tenant claim is what every downstream request is scoped by: it is
  // signed here, verified in middleware, and stamped onto the request from
  // there. Nothing later in the stack takes the client's word for it.
  const token = await signSession({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenant,
    linkedId: user.linkedId || null,
    linkedClasses: Array.isArray(user.linkedClasses) ? user.linkedClasses : [],
  });

  const jar = cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  // Non-sensitive hint so the login screen re-opens on the institution this
  // person last used. Grants nothing on its own — the signed session is the
  // only thing that unlocks a tenant's data.
  jar.set(TENANT_HINT_COOKIE, tenant, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  // Audit is best-effort and must not block the response — a slow write here
  // used to freeze the button on "Signing in…".
  runAsTenant(tenant, () => logAudit(user.name, "Sign in", user.email)).catch(() => {});

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id, email: user.email, name: user.name, role: user.role,
      tenant,
      institution: tenantConfig(tenant).name,
      linkedId: user.linkedId || null,
      linkedClasses: Array.isArray(user.linkedClasses) ? user.linkedClasses : [],
    },
  });
}
