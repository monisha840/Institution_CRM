import { NextResponse } from "next/server";
import { readPermissions, writePermissions, ALL_FEATURES, ROLES } from "@/lib/permissions";
import { getSession } from "@/lib/auth";
import { logAudit, listCustomRoles, listRoleFeatureAccess } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/permissions  → { permissions, features, roles }
// `permissions` is keyed by role and maps featureId → bool. We merge
// custom-role feature toggles into the same shape so the sidebar's
// existing `permissions[role][featureId] === false` gating works without
// any special casing for custom roles.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  const { permissions: permsBase, explicit: explicitBase } = await readPermissions();
  const permissions = { ...permsBase };
  const explicit = { ...explicitBase };
  // Fold every custom role's role_feature_access toggles into the matrix.
  // Anything not granted (canView=false or missing) is recorded as `false`
  // so the sidebar hides it. Granted features are recorded as `true`.
  // We also build a parallel `access` map keyed by role → feature → {view,edit,delete}
  // so screens can check write permission, not just view permission.
  const access = {};
  try {
    const custom = await listCustomRoles();
    for (const cr of custom) {
      const feats = await listRoleFeatureAccess(cr.id);
      const viewMap = {};
      const explicitMap = {};
      const detailMap = {};
      // Default everything to false — custom roles are deny-by-default so
      // a freshly-created role shows nothing until the admin grants a screen.
      for (const f of ALL_FEATURES) {
        viewMap[f.id] = false;
        explicitMap[f.id] = true; // custom roles record every feature explicitly
        detailMap[f.id] = { canView: false, canEdit: false, canDelete: false };
      }
      // Flip on the ones the admin explicitly granted.
      for (const f of feats) {
        if (f.canView) viewMap[f.featureName] = true;
        detailMap[f.featureName] = {
          canView:   !!f.canView,
          canEdit:   !!f.canEdit,
          canDelete: !!f.canDelete,
        };
      }
      // Always grant the personal "My account" screen so a user assigned
      // to a brand-new custom role can at least sign out.
      viewMap.account = true;
      detailMap.account = { canView: true, canEdit: true, canDelete: false };
      permissions[cr.id] = viewMap;
      explicit[cr.id] = explicitMap;
      access[cr.id] = detailMap;
    }
  } catch {}
  return NextResponse.json({
    ok: true,
    permissions,
    explicit,
    access,
    features: ALL_FEATURES,
    roles: ROLES,
  });
}

// PUT /api/permissions { role, permissions: { featureId: bool, ... } }
// Admin-only. Replaces the named role's matrix entries with the supplied ones.
export async function PUT(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  if (session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Only admin can edit permissions" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.role || !ROLES.includes(body.role)) {
    return NextResponse.json({ ok: false, error: "role required" }, { status: 400 });
  }
  if (!body.permissions || typeof body.permissions !== "object") {
    return NextResponse.json({ ok: false, error: "permissions object required" }, { status: 400 });
  }
  try {
    const merged = await writePermissions({ [body.role]: body.permissions });
    const flippedOff = Object.entries(body.permissions).filter(([_, v]) => v === false).map(([k]) => k);
    const flippedOn  = Object.entries(body.permissions).filter(([_, v]) => v === true).map(([k]) => k);
    try {
      await logAudit(
        session.name || "Admin",
        "Updated role permissions",
        `${body.role} · on=${flippedOn.length} off=${flippedOff.length}`
      );
    } catch {}
    return NextResponse.json({
      ok: true,
      permissions: merged.permissions,
      explicit: merged.explicit,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}
