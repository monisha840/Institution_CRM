import { NextResponse } from "next/server";
import { updateExpenseTemplate, removeExpenseTemplate, listExpenseTemplates, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ALL    = new Set(["admin", "principal"]);
const SCHOOL = new Set(["school_accountant"]);
const TRUST  = new Set(["trust_accountant"]);

function allowedScopes(role) {
  if (ALL.has(role))    return ["school", "trust"];
  if (SCHOOL.has(role)) return ["school"];
  if (TRUST.has(role))  return ["trust"];
  return [];
}

// Look up the existing template so we can check the caller's role
// against ITS scope (not just whatever scope they happen to pass).
async function findTemplate(id) {
  const all = await listExpenseTemplates();
  return all.find((t) => t.id === id) || null;
}

// PATCH /api/expenses/templates/[id]  { name?, category?, defaultAmount?, defaultVendor?, defaultPaymentMethod?, scope? }
export async function PATCH(req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  const scopes = allowedScopes(session.role);
  if (!scopes.length) {
    return NextResponse.json({ ok: false, error: "Not authorised to manage templates" }, { status: 403 });
  }
  const id = params?.id;
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const existing = await findTemplate(id);
  if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (!scopes.includes(existing.scope)) {
    return NextResponse.json({ ok: false, error: `Cannot edit a ${existing.scope} template from your role` }, { status: 403 });
  }

  let body; try { body = await req.json(); } catch { body = null; }
  // If the patch tries to flip the scope, ensure the new scope is also allowed.
  if (body?.scope && !scopes.includes(body.scope)) {
    return NextResponse.json({ ok: false, error: `Cannot move template into ${body.scope}` }, { status: 403 });
  }

  try {
    const updated = await updateExpenseTemplate(id, body || {});
    if (!updated) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    try { await logAudit(session.name || "User", "Edited expense template", `${updated.scope} · ${updated.name}`); } catch {}
    return NextResponse.json({ ok: true, template: updated });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}

// DELETE /api/expenses/templates/[id]
export async function DELETE(_req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  const scopes = allowedScopes(session.role);
  if (!scopes.length) {
    return NextResponse.json({ ok: false, error: "Not authorised to manage templates" }, { status: 403 });
  }
  const id = params?.id;
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const existing = await findTemplate(id);
  if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (!scopes.includes(existing.scope)) {
    return NextResponse.json({ ok: false, error: `Cannot delete a ${existing.scope} template from your role` }, { status: 403 });
  }

  const removed = await removeExpenseTemplate(id);
  if (!removed) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  try { await logAudit(session.name || "User", "Removed expense template", `${removed.scope} · ${removed.name}`); } catch {}
  return NextResponse.json({ ok: true });
}
