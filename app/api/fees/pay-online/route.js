import { NextResponse } from "next/server";
import { fileRead, fileWrite, payPendingFee, logAudit, readSettings } from "@/lib/db";
import { supabase, supabaseEnabled, fromStudent } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { notifyWhatsApp } from "@/lib/whatsapp";
import { renderReceiptPng } from "@/lib/receipt-image";
import { feeTypeLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

// Two-step "online" payment flow that mimics Razorpay's order/verify pattern
// without actually hitting an external gateway. In production, replace with:
//   POST step:    razorpay.orders.create({ amount, currency: "INR" })
//   verify step:  validate the signature returned by Razorpay's checkout JS
//
// POST /api/fees/pay-online   { id, amount, intent: "create" | "verify", paymentRef? }
//
// "create" → returns a pseudo order id; UI shows it inside a confirmation modal.
// "verify" → marks the pending fee as paid and writes a receipt with method="UPI online".
export async function POST(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });

  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  const intent = body.intent === "verify" ? "verify" : "create";

  if (intent === "create") {
    const db = fileRead();
    const fee = (db.pendingFees || []).find((f) => f.id === body.id);
    if (!fee) return NextResponse.json({ ok: false, error: "No pending fee for this student" }, { status: 404 });
    const amt = Math.max(1, Math.min(Number(body.amount) || fee.amount, fee.amount));
    // Pull the school's UPI handle + payee name from app settings so the
    // checkout deep-link routes to the correct account. Fall back to a
    // safe default if the admin hasn't filled them in yet.
    const settings = await readSettings();
    const upiId     = settings?.finance?.upi || "sanfort@school";
    const payeeName = settings?.finance?.upiPayeeName || "Sanfort International School";
    const order = {
      orderId: `OR-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 999)}`,
      gateway: "Razorpay (sandbox)",
      amount: amt,
      currency: "INR",
      studentId: fee.id,
      studentName: fee.name,
      cls: fee.cls,
      upiId,
      // A simple payment URL the frontend can show as a clickable / QR link.
      // In a real integration this would be the Razorpay checkout page.
      payUrl: `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${amt}&cu=INR&tn=Fee%20${fee.id}`,
      createdAt: new Date().toISOString(),
    };
    if (!Array.isArray(db.paymentOrders)) db.paymentOrders = [];
    db.paymentOrders.unshift(order);
    fileWrite(db);
    return NextResponse.json({ ok: true, order });
  }

  // verify branch — settle the pending fee and write a receipt.
  const amt = Number(body.amount);
  const ref = body.paymentRef || `MOCK-${Date.now().toString(36).toUpperCase()}`;
  if (!amt) return NextResponse.json({ ok: false, error: "amount required" }, { status: 400 });
  const result = await payPendingFee(body.id, "UPI online", amt);
  try {
    await logAudit(session.name || "Online payment",
      "Fee paid online", `${body.id} · ₹${amt.toLocaleString("en-IN")} · ref=${ref}`);
  } catch {}
  // Same fee_paid event as the in-office route — fire and forget.
  try {
    const paid = result?.paid;
    if (paid) {
      const sid = paid.studentId || paid.student_id;
      let student = null;
      if (supabaseEnabled && sid) {
        const sel = await supabase.from("students").select("*").eq("id", sid).maybeSingle();
        if (sel.data) student = fromStudent(sel.data);
      }
      if (!student && sid) {
        student = (fileRead().addedStudents || []).find((s) => s.id === sid);
      }
      const phone = student?.parent;
      if (phone) {
        const isPartial = (result.remaining || 0) > 0;
        const amountLabel = `₹${paid.amount.toLocaleString("en-IN")}`;
        const now = new Date();
        const dateStr = now.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
        const monthLabel = now.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
        const slNo = (paid.id.match(/\d+/) || [""])[0].slice(-3).padStart(3, "0");
        let imageBase64 = null;
        try {
          imageBase64 = renderReceiptPng({
            admissionNo: student?.id || sid || "—",
            studentName: paid.name,
            cls: student?.cls || paid.cls || "—",
            monthLabel,
            dateStr,
            slNo,
            receiptId: paid.id,
            method: paid.method || "UPI online",
            feeType: paid.feeType,
            amount: paid.amount,
            balancePending: isPartial ? result.remaining : 0,
            cashier: "Online",
          });
        } catch (e) { console.warn(`[whatsapp] receipt render failed: ${e.message}`); }
        const balanceLabel = `₹${(isPartial ? result.remaining : 0).toLocaleString("en-IN")}`;
        const caption = [
          `Name: ${paid.name}`,
          `Class & Section: ${student?.cls || paid.cls || "—"}`,
          `Fees paid: ${amountLabel}`,
          `Balance to pay: ${balanceLabel}`,
          "",
          "Thank you for paying the fees.",
          "— Sanfort International School",
        ].join("\n");
        notifyWhatsApp("fee_paid", {
          phone,
          parentName: "Parent",
          studentName: paid.name,
          studentId: student?.id || sid,
          cls: student?.cls || null,
          amount: amountLabel,
          receiptId: paid.id,
          partial: isPartial,
          remaining: result.remaining || 0,
          method: paid.method || "UPI online",
          imageUrl: imageBase64,
          caption,
        }).catch(() => {});
      } else {
        console.warn(`[whatsapp] fee_paid (online) skipped: no phone for studentId=${sid}`);
      }
    }
  } catch (e) { console.warn(`[whatsapp] fee_paid (online) lookup failed: ${e.message}`); }
  return NextResponse.json({ ok: true, ...result, paymentRef: ref });
}
