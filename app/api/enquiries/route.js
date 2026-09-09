import { NextResponse } from "next/server";
import { patchEnquiryStatus, addEnquiry, logAudit, convertEnquiryToAdmission } from "@/lib/db";
import { getSession } from "@/lib/auth";

const VALID_STATUSES = ["New", "Contacted", "Converted", "Rejected"];

function formatIndianPhone(raw) {
  if (!raw) return "—";
  let digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  if (digits.length !== 10 || !/^[6-9]/.test(digits)) return null;
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

export async function PATCH(req) {
  const session = await getSession();
  const actor = session?.name || "Principal";

  let body; try { body = await req.json(); } catch { body = null; }
  const { id, status } = body || {};
  if (!id || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ ok: false, error: "id + valid status required" }, { status: 400 });
  }
  // Special-case: moving to "Converted" promotes the enquiry into a real
  // admission AND provisions a parent login. Other status transitions are
  // simple flips through patchEnquiryStatus.
  if (status === "Converted") {
    let result;
    try {
      result = await convertEnquiryToAdmission(id);
    } catch (e) {
      return NextResponse.json({ ok: false, error: e.message || "Conversion failed" }, { status: 500 });
    }
    if (!result) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    try {
      await logAudit(
        actor,
        result.parentLogin.alreadyExisted ? "Enquiry → Converted (re-confirm)" : "Enquiry → Admitted + parent provisioned",
        `${result.enquiry.id} ${result.enquiry.name} · student ${result.student.id}`,
      );
    } catch {}
    return NextResponse.json({
      ok: true,
      enquiry: result.enquiry,
      student: result.student,
      parentLogin: result.parentLogin,
    });
  }

  const updated = await patchEnquiryStatus(id, status);
  if (!updated) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  try { await logAudit(actor, `Enquiry → ${status}`, `${updated.id} ${updated.name}`); } catch {}
  return NextResponse.json({ ok: true, enquiry: updated });
}

export async function POST(req) {
  const session = await getSession();
  const actor = session?.name || "System";

  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.name?.trim()) {
    return NextResponse.json({ ok: false, error: "Student name is required" }, { status: 400 });
  }
  let phone = "—";
  if (body.phone && String(body.phone).trim() && String(body.phone).trim() !== "—") {
    const formatted = formatIndianPhone(body.phone);
    if (formatted === null) {
      return NextResponse.json(
        { ok: false, error: "Phone must be a 10-digit Indian mobile starting with 6/7/8/9" },
        { status: 400 }
      );
    }
    phone = formatted;
  }
  const id = `ENQ-${1124 + Math.floor(Math.random() * 8999)}`;
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  // Address comes through as a nested object from the new admission form,
  // but older API callers may still send a flat string. Normalise both shapes
  // so the file store gets a consistent record.
  const addr = body.address && typeof body.address === "object" ? body.address : null;
  const row = {
    id,
    name: body.name.trim(),
    parent: String(body.parent || "").trim() || "—",
    phone,
    cls: Number(body.cls) || 1,
    source: body.source || "Website",
    date: today,
    status: "New",
    // New fields from the Sanfort admission template — all optional so older
    // callers don't break. PIN is kept as a string to preserve the leading
    // zeros some PIN codes have.
    dob:    body.dob || null,
    age:    body.age == null ? null : Number(body.age),
    street: addr ? (addr.street || null) : (body.street || null),
    city:   addr ? (addr.city   || null) : (body.city   || null),
    pin:    addr ? (addr.pin    || null) : (body.pin    || null),
  };
  try {
    const created = await addEnquiry(row);
    try { await logAudit(actor, "New enquiry", `${created.id} ${created.name} · ${row.source}`); } catch {}
    return NextResponse.json({ ok: true, enquiry: created });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}
