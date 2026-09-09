import { NextResponse } from "next/server";
import {
  listTeachers, listUsers, updateUser, createUser, getUserByEmail,
  listCustomRoles, logAudit,
} from "@/lib/db";
import { hashPassword, getSession } from "@/lib/auth";

const CAN_MANAGE = new Set(["admin", "principal", "academic_director"]);
// Only admin can mint user accounts — keeps password handling tight and
// stops principals from quietly elevating themselves.
const CAN_CREATE = new Set(["admin"]);
// The seven canonical roles the system has hard-coded sidebars + permissions
// for. Any value not in this set is checked against the custom_roles table.
const CANONICAL_ROLES = new Set([
  "admin", "principal", "academic_director", "teacher", "parent",
  "school_accountant", "trust_accountant", "transport_manager", "fees_manager",
]);

// GET /api/users?role=teacher → list teachers (id, name, email, linkedId).
// Used by the Classes screen to populate the "Class teacher" picker.
export async function GET(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const url = new URL(req.url);
  const role = url.searchParams.get("role");
  if (role === "teacher") {
    const teachers = await listTeachers();
    return NextResponse.json({ ok: true, teachers });
  }
  // No filter — return every user. Used by Tasks screen to populate the
  // "Assign to" dropdown. Parents are filtered out client-side because the
  // Tasks UI excludes them by policy.
  const all = await listUsers();
  // Strip hashed passwords / sensitive fields before sending to the client.
  const safe = all.map(({ hashedPassword, password, ...rest }) => rest);
  return NextResponse.json({ ok: true, users: safe });
}

// POST /api/users  { name, email, password, role, linkedId? }
//   Creates a fresh login. `role` may be one of the seven canonical roles
//   OR the id of a row in custom_roles (so the new admin-built roles you
//   define on the Custom Roles screen are actually assignable).
export async function POST(req) {
  const session = await getSession();
  if (!session || !CAN_CREATE.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Only admin can create users" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  const name = String(body?.name || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  const role = String(body?.role || "").trim();
  const linkedId = body?.linkedId ? String(body.linkedId).trim() : null;

  if (!name)            return NextResponse.json({ ok: false, error: "Name required" }, { status: 400 });
  if (!email)           return NextResponse.json({ ok: false, error: "Email required" }, { status: 400 });
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ ok: false, error: "Email looks invalid" }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ ok: false, error: "Password must be at least 6 characters" }, { status: 400 });
  if (!role)            return NextResponse.json({ ok: false, error: "Role required" }, { status: 400 });

  // Validate the role — canonical or a real custom role row.
  if (!CANONICAL_ROLES.has(role)) {
    let custom = [];
    try { custom = await listCustomRoles(); } catch {}
    if (!custom.find((r) => r.id === role)) {
      return NextResponse.json({ ok: false, error: "Unknown role — pick a built-in role or one of your custom roles" }, { status: 400 });
    }
  }

  // Don't double-create.
  try {
    const dup = await getUserByEmail(email);
    if (dup) return NextResponse.json({ ok: false, error: "A user with that email already exists" }, { status: 409 });
  } catch {}

  // Build a friendly id from the role so the directory reads naturally.
  const slug = email.split("@")[0].replace(/[^a-z0-9]+/gi, "").slice(0, 12).toUpperCase() || "USR";
  const id = `USR-${slug}-${Date.now().toString(36).slice(-4).toUpperCase()}`;

  let row;
  try {
    const passwordHash = await hashPassword(password);
    row = await createUser({ id, email, passwordHash, role, name, linkedId });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed to create user" }, { status: 500 });
  }

  try {
    await logAudit(session.name || "Admin", "Created user", `${row.id} · ${row.name} (${row.email}) · role=${role}`);
  } catch {}

  // Strip the hash before returning.
  const { hashedPassword, password: _p, passwordHash: _h, ...safe } = row;
  return NextResponse.json({ ok: true, user: safe });
}

// PATCH /api/users — update a user.
// Body shape (any of):
//   { id, linkedId: "2-A,5-B" }      replace whole assignment list (CSV)
//   { id, linkedClasses: ["2-A","5-B"] }  replace whole assignment (array)
//   { id, addClass: "5-B" }          atomically add a section to the list
//   { id, removeClass: "2-A" }       atomically remove a section
// Only principal / admin / academic_director can do this.
export async function PATCH(req) {
  const session = await getSession();
  if (!session || !CAN_MANAGE.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id) {
    return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  }
  const patch = {};
  if ("linkedId" in body)            patch.linkedId = body.linkedId;
  if ("linkedClasses" in body)       patch.linkedClasses = body.linkedClasses;
  if (typeof body.addClass === "string")    patch.addClass = body.addClass;
  if (typeof body.removeClass === "string") patch.removeClass = body.removeClass;
  if (typeof body.name === "string") patch.name = body.name;
  if (typeof body.role === "string") patch.role = body.role;

  const updated = await updateUser(body.id, patch);
  if (!updated) return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });

  // Build a human audit entry that explains what changed.
  let action = "Updated user";
  let entity = `${updated.name || updated.id}`;
  if (typeof body.addClass === "string") {
    action = "Added class assignment";
    entity = `${updated.name} → +${body.addClass} (now: ${updated.linkedClasses?.join(", ") || "—"})`;
  } else if (typeof body.removeClass === "string") {
    action = "Removed class assignment";
    entity = `${updated.name} → −${body.removeClass} (now: ${updated.linkedClasses?.join(", ") || "(none)"})`;
  } else if ("linkedId" in body || "linkedClasses" in body) {
    action = "Set class assignments";
    entity = `${updated.name} → ${updated.linkedClasses?.join(", ") || "(unassigned)"}`;
  }
  try { await logAudit(session.name || "Principal", action, entity); } catch {}

  return NextResponse.json({ ok: true, user: updated });
}
