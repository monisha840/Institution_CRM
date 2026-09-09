import { NextResponse } from "next/server";
import { listExpenseCategories, addExpenseCategory, removeExpenseCategory, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Roles that can manage expense categories. Accountants get scoped
// access — school accountant manages 'school' categories, trust
// accountant manages 'trust' categories. Admin / principal get both.
const ALL_TYPES = new Set(["admin", "principal"]);
const SCHOOL_ONLY = new Set(["school_accountant"]);
const TRUST_ONLY  = new Set(["trust_accountant"]);

function allowedTypes(role) {
  if (ALL_TYPES.has(role))    return ["school", "trust"];
  if (SCHOOL_ONLY.has(role))  return ["school"];
  if (TRUST_ONLY.has(role))   return ["trust"];
  return [];
}

// GET /api/expenses/categories?type=school|trust
export async function GET(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const url = new URL(req.url);
  const type = url.searchParams.get("type") || undefined;
  const cats = await listExpenseCategories({ type });
  return NextResponse.json({ ok: true, categories: cats });
}

// POST /api/expenses/categories { name, type }
export async function POST(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  const types = allowedTypes(session.role);
  if (!types.length) {
    return NextResponse.json({ ok: false, error: "Not authorised to add categories" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  const name = (body?.name || "").trim();
  const type = body?.type || types[0];
  if (!name) return NextResponse.json({ ok: false, error: "name required" }, { status: 400 });
  if (!types.includes(type)) {
    return NextResponse.json({ ok: false, error: `Cannot add a ${type} category from your role` }, { status: 403 });
  }
  try {
    const cat = await addExpenseCategory({ name, type, createdBy: session.sub });
    try { await logAudit(session.name || "User", "Added expense category", `${cat.type} · ${cat.name}`); } catch {}
    return NextResponse.json({ ok: true, category: cat });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}

// DELETE /api/expenses/categories { id }
export async function DELETE(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  if (!ALL_TYPES.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Only admin / principal can remove categories" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  const removed = await removeExpenseCategory(body.id);
  if (!removed) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  try { await logAudit(session.name || "User", "Removed expense category", `${removed.type} · ${removed.name}`); } catch {}
  return NextResponse.json({ ok: true });
}
