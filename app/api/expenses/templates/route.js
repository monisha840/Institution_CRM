import { NextResponse } from "next/server";
import { listExpenseTemplates, addExpenseTemplate, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Same role gates as /api/expenses/categories — admin/principal manage
// both scopes; school_accountant manages school only; trust_accountant
// manages trust only. Templates are a UX shortcut, not a privilege.
const ALL    = new Set(["admin", "principal"]);
const SCHOOL = new Set(["school_accountant"]);
const TRUST  = new Set(["trust_accountant"]);

function allowedScopes(role) {
  if (ALL.has(role))    return ["school", "trust"];
  if (SCHOOL.has(role)) return ["school"];
  if (TRUST.has(role))  return ["trust"];
  return [];
}

// GET /api/expenses/templates?scope=school|trust
export async function GET(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") || undefined;
  const templates = await listExpenseTemplates({ scope });
  return NextResponse.json({ ok: true, templates });
}

// POST /api/expenses/templates { name, category, defaultAmount?, defaultVendor?, defaultPaymentMethod?, scope? }
export async function POST(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  const scopes = allowedScopes(session.role);
  if (!scopes.length) {
    return NextResponse.json({ ok: false, error: "Not authorised to manage templates" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  const name = String(body?.name || "").trim();
  const category = String(body?.category || "").trim();
  const scope = body?.scope || scopes[0];
  if (!name) return NextResponse.json({ ok: false, error: "name required" }, { status: 400 });
  if (!category) return NextResponse.json({ ok: false, error: "category required" }, { status: 400 });
  if (!scopes.includes(scope)) {
    return NextResponse.json({ ok: false, error: `Cannot create a ${scope} template from your role` }, { status: 403 });
  }
  try {
    const tmpl = await addExpenseTemplate({
      name,
      category,
      defaultAmount: body?.defaultAmount,
      defaultVendor: body?.defaultVendor,
      defaultPaymentMethod: body?.defaultPaymentMethod,
      scope,
      createdBy: session.sub,
    });
    try { await logAudit(session.name || "User", "Added expense template", `${tmpl.scope} · ${tmpl.name}`); } catch {}
    return NextResponse.json({ ok: true, template: tmpl });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}
