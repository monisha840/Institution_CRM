import { NextResponse } from "next/server";
import { renderBrandedQrBuffer } from "@/lib/qr-image";

export const dynamic = "force-dynamic";

// GET /api/fees/qr-image?data=<encoded UPI URI>&size=300
// Returns a PNG of the Sanfort-branded QR (blue + orange + logo).
// Used both on-screen (<UpiQR src="/api/fees/qr-image?data=...">) and
// indirectly inside the WhatsApp send-qr flow.
export async function GET(req) {
  const url = new URL(req.url);
  const data = url.searchParams.get("data") || "";
  const size = Math.min(800, Math.max(120, Number(url.searchParams.get("size")) || 300));
  if (!data) {
    return NextResponse.json({ ok: false, error: "data param required" }, { status: 400 });
  }
  try {
    const buf = await renderBrandedQrBuffer(data, { size });
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
