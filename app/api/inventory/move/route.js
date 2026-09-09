import { NextResponse } from "next/server";
import { moveInventory, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function POST(req) {
  const session = await getSession();
  const actor = session?.name || "Principal";

  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.itemId || !body?.qty) {
    return NextResponse.json({ ok: false, error: "itemId and qty required" }, { status: 400 });
  }
  if (!["in", "out", "return"].includes(body.type)) {
    return NextResponse.json({ ok: false, error: "type must be 'in', 'out' or 'return'" }, { status: 400 });
  }
  try {
    const result = await moveInventory({
      itemId: body.itemId,
      type: body.type,
      qty: body.qty,
      note: body.note,
      issuedTo: body.issuedTo,
      who: actor,
    });
    const actionLabel = body.type === "in" ? "Stock in" : body.type === "return" ? "Returned" : "Issued";
    try {
      await logAudit(
        actor,
        actionLabel,
        `${result.item.id} ${result.item.name} · ${body.qty}${body.issuedTo ? " → " + body.issuedTo : ""}${body.note ? " · " + body.note : ""}`,
      );
    } catch {}
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Move failed" }, { status: 500 });
  }
}
