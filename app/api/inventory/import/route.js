import { NextResponse } from "next/server";
import { bulkAddInventoryItems, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const maxDuration = 60;

const CAN_IMPORT = new Set(["admin", "principal"]);

// POST /api/inventory/import
//   { rows: [{ id?, name, category?, description?, cls?, onHand?, qtyPurchased?,
//              issued?, min?, unitPrice?, totalCost?, supplier?, storageLocation? }, ...] }
//
// Bulk-create inventory SKUs from a Sanfort-style stock register spreadsheet.
// Uses batch inserts (chunks of 100) — not one DB round-trip per row.
export async function POST(req) {
  const session = await getSession();
  if (!session || !CAN_IMPORT.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Only admin or principal can import inventory" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  const rows = Array.isArray(body?.rows) ? body.rows : null;
  if (!rows) return NextResponse.json({ ok: false, error: "rows array required" }, { status: 400 });
  if (rows.length === 0) return NextResponse.json({ ok: false, error: "Spreadsheet has no rows" }, { status: 400 });
  if (rows.length > 5000) return NextResponse.json({ ok: false, error: "Max 5000 rows per import" }, { status: 400 });

  // Drop blank/header leftovers before touching the DB.
  const cleaned = rows.filter((r) => r && typeof r === "object" && String(r.name || "").trim());

  try {
    const { imported, errors } = await bulkAddInventoryItems(cleaned);
    try {
      await logAudit(
        session.name || "Admin",
        "Imported inventory",
        `${imported.length} of ${cleaned.length} rows imported${errors.length ? ` · ${errors.length} skipped` : ""}`
      );
    } catch {}
    return NextResponse.json({
      ok: true,
      imported,
      errors,
      skippedBlank: rows.length - cleaned.length,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Import failed" }, { status: 500 });
  }
}
