import { NextResponse } from "next/server";
import {
  listCustomRoles, addCustomRole, removeCustomRole,
  listRoleFeatureAccess, setRoleFeatureAccess,
  logAudit,
} from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const WRITE_ROLES = new Set(["admin"]);

// GET /api/custom-roles?roleId=…
//   Without roleId → returns all custom roles.
//   With roleId    → returns the role + its feature-access map.
export async function GET(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  const url = new URL(req.url);
  const roleId = url.searchParams.get("roleId");
  if (roleId) {
    const features = await listRoleFeatureAccess(roleId);
    return NextResponse.json({ ok: true, features });
  }
  const roles = await listCustomRoles();
  return NextResponse.json({ ok: true, roles });
}

// POST /api/custom-roles { roleName }
export async function POST(req) {
  const session = await getSession();
  if (!session || !WRITE_ROLES.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Only admin can create custom roles" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.roleName) return NextResponse.json({ ok: false, error: "roleName required" }, { status: 400 });
  try {
    const role = await addCustomRole({ roleName: body.roleName, createdBy: session.sub });
    try { await logAudit(session.name || "Admin", "Created custom role", `${role.id} · ${role.roleName}`); } catch {}
    return NextResponse.json({ ok: true, role });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }
}

// PATCH /api/custom-roles { roleId, featureName, canView, canEdit, canDelete }
export async function PATCH(req) {
  const session = await getSession();
  if (!session || !WRITE_ROLES.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.roleId || !body?.featureName) {
    return NextResponse.json({ ok: false, error: "roleId and featureName required" }, { status: 400 });
  }
  try {
    const access = await setRoleFeatureAccess(body.roleId, body.featureName, {
      canView:   body.canView !== false,
      canEdit:   !!body.canEdit,
      canDelete: !!body.canDelete,
    });
    try {
      await logAudit(
        session.name || "Admin", "Updated role feature access",
        `${body.roleId} · ${body.featureName} · view=${access.canView} edit=${access.canEdit} delete=${access.canDelete}`
      );
    } catch {}
    return NextResponse.json({ ok: true, access });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }
}

// DELETE /api/custom-roles { id }
export async function DELETE(req) {
  const session = await getSession();
  if (!session || !WRITE_ROLES.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  const removed = await removeCustomRole(body.id);
  if (!removed) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  try { await logAudit(session.name || "Admin", "Removed custom role", `${removed.id} · ${removed.roleName}`); } catch {}
  return NextResponse.json({ ok: true });
}
