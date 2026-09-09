import { NextResponse } from "next/server";
import { addInventoryItem, updateInventoryItem, archiveInventoryItem, bulkArchiveInventoryItems, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function POST(req) {
  const session = await getSession();
  const actor = session?.name || "Principal";

  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.name?.trim()) {
    return NextResponse.json({ ok: false, error: "Item name is required" }, { status: 400 });
  }
  try {
    const item = await addInventoryItem(body);
    try { await logAudit(actor, "Added inventory item", `${item.id} ${item.name} · ${item.category}`); } catch {}
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed to add item" }, { status: 500 });
  }
}

export async function PATCH(req) {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "principal")) {
    return NextResponse.json({ ok: false, error: "Only admin or principal can edit inventory" }, { status: 403 });
  }
  const actor = session?.name || "Principal";

  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id) {
    return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  }
  try {
    const item = await updateInventoryItem(body);
    try { await logAudit(actor, "Edited inventory item", `${item.id} ${item.name || ""}`.trim()); } catch {}
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Update failed" }, { status: 500 });
  }
}

export async function DELETE(req) {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "principal")) {
    return NextResponse.json({ ok: false, error: "Only admin or principal can delete inventory" }, { status: 403 });
  }
  const actor = session?.name || "Principal";

  let body; try { body = await req.json(); } catch { body = null; }

  // Bulk delete: { ids: ["SIS-001", ...] }
  const ids = Array.isArray(body?.ids)
    ? body.ids
    : body?.id
      ? [body.id]
      : null;
  if (!ids?.length) {
    return NextResponse.json({ ok: false, error: "id or ids required" }, { status: 400 });
  }

  try {
    if (ids.length === 1) {
      const removed = await archiveInventoryItem(ids[0]);
      if (!removed) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      try { await logAudit(actor, "Removed inventory item", `${removed.id} ${removed.name}`); } catch {}
      return NextResponse.json({ ok: true, removed: 1, ids: [removed.id] });
    }

    const result = await bulkArchiveInventoryItems(ids);
    try {
      await logAudit(actor, "Bulk deleted inventory", `${result.removed} item${result.removed === 1 ? "" : "s"}`);
    } catch {}
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Delete failed" }, { status: 500 });
  }
}
