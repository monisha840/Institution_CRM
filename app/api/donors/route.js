import { NextResponse } from "next/server";
import { addDonor, archiveDonor, recordDonation, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

function formatIndianPhone(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  if (digits.length !== 10 || !/^[6-9]/.test(digits)) return null;
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

export async function POST(req) {
  const session = await getSession();
  const actor = session?.name || "Principal";

  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.name?.trim()) {
    return NextResponse.json({ ok: false, error: "Donor name is required" }, { status: 400 });
  }
  let phone = null;
  if (body.phone && String(body.phone).trim()) {
    const formatted = formatIndianPhone(body.phone);
    if (formatted === null) {
      return NextResponse.json({ ok: false, error: "Phone must be a 10-digit Indian mobile starting with 6/7/8/9" }, { status: 400 });
    }
    phone = formatted;
  }
  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email).trim())) {
    return NextResponse.json({ ok: false, error: "Invalid email address" }, { status: 400 });
  }
  try {
    const donor = await addDonor({
      name: body.name.trim(),
      type: body.type,
      email: body.email ? String(body.email).trim() : null,
      phone,
      ytd: Number(body.ytd) || 0,
      last: body.last || null,
      next: body.next || null,
    });
    try { await logAudit(actor, "Added donor", `${donor.id} ${donor.name} · ${donor.type}`); } catch {}
    return NextResponse.json({ ok: true, donor });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed to add donor" }, { status: 500 });
  }
}

// PATCH /api/donors  { id, donate: { amount, method?, memo?, campaignId? } }
// Records a fresh donation against an existing donor and returns the generated
// 80G-style receipt. The donor's YTD + last-gift line are bumped server-side.
export async function PATCH(req) {
  const session = await getSession();
  const actor = session?.name || "Principal";
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  if (!body.donate || !Number(body.donate.amount)) {
    return NextResponse.json({ ok: false, error: "donate.amount must be a positive number" }, { status: 400 });
  }
  try {
    const { donor, receipt } = await recordDonation(body.id, body.donate);
    try { await logAudit(actor, "Recorded donation", `${donor.id} ${donor.name} · ₹${receipt.amount.toLocaleString("en-IN")} · ${receipt.id}`); } catch {}
    return NextResponse.json({ ok: true, donor, receipt });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}

export async function DELETE(req) {
  const session = await getSession();
  const actor = session?.name || "Principal";
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  const removed = await archiveDonor(body.id);
  if (!removed) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  try { await logAudit(actor, "Removed donor", `${removed.id} ${removed.name}`); } catch {}
  return NextResponse.json({ ok: true });
}
