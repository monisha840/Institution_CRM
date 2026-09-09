import { NextResponse } from "next/server";
import { fileRead, readSettings, logAudit } from "@/lib/db";
import { supabase, supabaseEnabled, fromPendingFee, fromStudent } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { notifyWhatsApp } from "@/lib/whatsapp";
import { feeTypeLabel } from "@/lib/format";
import { renderBrandedQrBase64 } from "@/lib/qr-image";

// POST /api/fees/send-qr
//   { id: <pendingFeeId>, amount: <int>, method?: "UPI" }
// Builds the UPI deep link + a public PNG QR (api.qrserver.com) for the
// requested amount, then fires `fee_qr_send` to the n8n webhook so the
// parent receives the QR via WhatsApp on their registered number.
export async function POST(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });

  let body; try { body = await req.json(); } catch { body = null; }
  const id = body?.id;
  const requested = Math.max(1, Math.floor(Number(body?.amount) || 0));
  const method = body?.method || "UPI";
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  if (!requested) return NextResponse.json({ ok: false, error: "amount required" }, { status: 400 });

  // Resolve the pending fee — try Supabase first (since new fees write
  // there), fall back to the file store for legacy / dev rows.
  let fee = null;
  if (supabaseEnabled) {
    const sel = await supabase.from("pending_fees").select("*").eq("id", id).maybeSingle();
    if (sel.data) fee = fromPendingFee(sel.data);
  }
  const db = fileRead();
  if (!fee) fee = (db.pendingFees || []).find((f) => f.id === id);
  if (!fee) return NextResponse.json({ ok: false, error: "Pending fee not found" }, { status: 404 });

  // Same dual-source lookup for the student (need their parent phone).
  const studentId = fee.studentId || (typeof fee.id === "string" && fee.id.includes("__") ? fee.id.split("__")[0] : fee.id);
  let student = null;
  if (supabaseEnabled && studentId) {
    const sel = await supabase.from("students").select("*").eq("id", studentId).maybeSingle();
    if (sel.data) student = fromStudent(sel.data);
  }
  if (!student) student = (db.addedStudents || []).find((s) => s.id === studentId);
  const phone = student?.parent || fee.parent;
  if (!phone) {
    return NextResponse.json({ ok: false, error: "No parent phone on file for this student" }, { status: 400 });
  }

  // UPI handle + payee name come from the same Settings row the on-screen
  // QR uses, so the WhatsApp QR is identical to the one shown in-office.
  const settings = await readSettings();
  const upiId     = settings?.finance?.upi || "sanfort@hdfc";
  const payeeName = settings?.finance?.upiPayeeName || "Sanfort International School";

  // Build the standard UPI deep-link with the amount + a transaction note
  // so the parent's UPI app opens pre-filled.
  const params = new URLSearchParams();
  params.set("pa", upiId);
  params.set("pn", payeeName);
  params.set("am", String(requested));
  params.set("cu", "INR");
  params.set("tn", `Fee ${fee.id}`);
  params.set("tr", fee.id);
  const upiUri = `upi://pay?${params.toString()}`;

  // Render the branded QR (blue + orange + Sanfort logo) server-side and
  // pass it as raw base64 — Evolution API's sendMedia accepts base64 directly,
  // so the host doesn't need to be publicly reachable from the WhatsApp side.
  let qrImageBase64;
  try {
    qrImageBase64 = await renderBrandedQrBase64(upiUri, { size: 600 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `QR render failed: ${e.message}` }, { status: 500 });
  }

  // Caption shown beneath the QR in WhatsApp. Kept under 1024 chars to fit
  // inside Meta's image-caption limit.
  const amountLabel = `₹${requested.toLocaleString("en-IN")}`;
  const caption = [
    `Hi, here is the UPI QR for ${student?.name || fee.name || "your child"}'s fee payment.`,
    "",
    `Amount: ${amountLabel}`,
    `Payee:  ${payeeName}`,
    `UPI ID: ${upiId}`,
    fee.feeType ? `Fee:    ${feeTypeLabel(fee.feeType)}` : null,
    student?.cls ? `Class:  ${student.cls}` : (fee.cls ? `Class:  ${fee.cls}` : null),
    `Ref:    ${fee.id}`,
    "",
    "Open the image in any UPI app to pay. Receipt will be issued automatically once we receive it.",
    "— Sanfort International School",
  ].filter(Boolean).join("\n");

  const result = await notifyWhatsApp("fee_qr_send", {
    phone,
    parentName: "Parent",
    studentName: student?.name || fee.name || "your child",
    studentId: student?.id || fee.id,
    cls: student?.cls || fee.cls || null,
    amount: amountLabel,
    upiId,
    payeeName,
    upiUri,
    // Raw base64 PNG (no data: prefix) — Evolution sendMedia accepts it
    // directly as `media`, identical handling to the receipt PNG.
    imageUrl: qrImageBase64,
    caption,
    receiptId: fee.id,
    method,
  });

  try {
    await logAudit(
      session.name || "Fees",
      "Sent UPI QR via WhatsApp",
      `${fee.id} ${student?.name || fee.name} · ${amountLabel} → ${phone}`
    );
  } catch {}

  if (!result.ok) {
    // Surface a useful error to the UI but don't pretend it succeeded.
    return NextResponse.json(
      { ok: false, error: result.skipped || result.error || "WhatsApp send failed" },
      { status: result.skipped ? 400 : 502 }
    );
  }
  return NextResponse.json({ ok: true, sentTo: phone, upiUri });
}
