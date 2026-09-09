import { NextResponse } from "next/server";
import { payPendingFee, addActivity, logAudit, fileRead } from "@/lib/db";
import { supabase, supabaseEnabled, fromStudent } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { notifyWhatsApp } from "@/lib/whatsapp";
import { feeTypeLabel } from "@/lib/format";
import { renderReceiptPng } from "@/lib/receipt-image";

export async function POST(req) {
  const session = await getSession();
  // Parents are read-only on fees — payments are recorded by school staff
  // at the office. Reject parent attempts at the API layer so a tampered
  // client can't slip a payment through.
  if (session?.role === "parent") {
    return NextResponse.json(
      { ok: false, error: "Payments are recorded by the school office, not by parents." },
      { status: 403 }
    );
  }
  const actor = session?.name || "Principal";

  let body; try { body = await req.json(); } catch { body = null; }
  const id = body?.id;
  const method = body?.method || "UPI";
  // amount is optional — omitted means "pay full balance".
  const amount = (body && body.amount != null && body.amount !== "") ? Number(body.amount) : null;
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  let result;
  try {
    result = await payPendingFee(id, method, amount);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }
  if (!result) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const { paid, remaining, fee } = result;
  const isPartial = remaining > 0;
  const subParts = [
    `${method}`,
    `₹${paid.amount.toLocaleString("en-IN")}`,
    isPartial ? `partial · ₹${remaining.toLocaleString("en-IN")} pending` : "fully paid",
    "receipt auto-sent",
  ];
  try {
    await addActivity({
      t: "fee", tone: "accent",
      title: `Fee ${isPartial ? "part-" : ""}received · ${paid.id} ${paid.name}`,
      sub: subParts.join(" · "),
      ts: "now",
    });
  } catch {}
  try {
    await logAudit(
      actor,
      isPartial ? "Partial fee payment" : "Marked fee paid",
      `${paid.id} ${paid.name} · ₹${paid.amount.toLocaleString("en-IN")}${isPartial ? ` (₹${remaining.toLocaleString("en-IN")} left)` : ""}`,
    );
  } catch {}

  // Fire the fee_paid event to n8n → WhatsApp. Fire-and-forget: any glitch
  // here must not block the API response. Look up the student via Supabase
  // first (where new admissions live), fall back to the file store.
  try {
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
      // Render the actual bill as a PNG (server-side via @napi-rs/canvas) and
      // ship it as base64 so the n8n → Evolution chain doesn't need a
      // publicly-reachable URL. Caption is short text shown beneath the image.
      const amountLabel = `₹${paid.amount.toLocaleString("en-IN")}`;
      const now = new Date();
      const dateStr = now.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
      const monthLabel = now.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
      // Orderly SL No — the receipt's chronological rank (matches the Fees
      // screen). Falls back to the id digits only if the serial is missing.
      const slNo = paid.serial != null
        ? String(paid.serial).padStart(3, "0")
        : (paid.id.match(/\d+/) || [""])[0].slice(-3).padStart(3, "0");

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
          method: paid.method || "—",
          feeType: paid.feeType,
          amount: paid.amount,
          balancePending: isPartial ? remaining : 0,
          cashier: actor || "Cashier",
        });
      } catch (e) {
        console.warn(`[whatsapp] receipt render failed: ${e.message}`);
      }

      const balanceLabel = `₹${(isPartial ? remaining : 0).toLocaleString("en-IN")}`;
      const caption = [
        `Name: ${paid.name}`,
        `Class & Section: ${student?.cls || paid.cls || "—"}`,
        `Fees paid: ${amountLabel}`,
        `Balance to pay: ${balanceLabel}`,
        "",
        "Thank you for paying the fees.",
        "— Sanfort International School",
      ].join("\n");

      // Don't await — let it run in the background.
      notifyWhatsApp("fee_paid", {
        phone,
        parentName: "Parent",
        studentName: paid.name,
        studentId: student?.id || sid,
        cls: student?.cls || null,
        amount: amountLabel,
        receiptId: paid.id,
        feeType: feeTypeLabel(paid.feeType),
        partial: isPartial,
        remaining: isPartial ? remaining : 0,
        method: paid.method,
        // n8n image branch reads imageUrl OR imageBase64. The base64 is the
        // full data URI ("data:image/png;base64,...") — both Evolution API
        // and Meta Cloud API accept this directly as media.
        imageUrl: imageBase64,
        caption,
      }).catch(() => {});
    } else {
      console.warn(`[whatsapp] fee_paid skipped: no phone for studentId=${sid}`);
    }
  } catch (e) {
    console.warn(`[whatsapp] fee_paid lookup failed: ${e.message}`);
  }

  return NextResponse.json({
    ok: true,
    fee: paid,
    remaining,
    studentFeeStatus: fee,
    partial: isPartial,
  });
}
