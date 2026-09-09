import { NextResponse } from "next/server";
import {
  addDonorFormSubmission,
  listDonorFormSubmissions,
  updateDonorFormSubmissionStatus,
  notifyRole,
  addDonor,
  recordDonation,
  logAudit,
} from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Roles allowed to see / triage submissions.
const REVIEW_ROLES = new Set(["admin", "principal", "trust_accountant"]);

// POST /api/donor-form — PUBLIC (no auth). Anyone can submit.
//
// Validates lightly, drops the row in donor_form_submissions, and fans
// out a notification to admin / principal / trust accountant so the bell
// shows it within their next poll.
export async function POST(req) {
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.donorName || !String(body.donorName).trim()) {
    return NextResponse.json({ ok: false, error: "Your name is required" }, { status: 400 });
  }
  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email))) {
    return NextResponse.json({ ok: false, error: "Email format looks invalid" }, { status: 400 });
  }
  // Cap the message length so the form can't be used to dump arbitrary blobs.
  if (typeof body.message === "string" && body.message.length > 2000) {
    return NextResponse.json({ ok: false, error: "Message is too long" }, { status: 400 });
  }
  try {
    const submission = await addDonorFormSubmission({
      donorName:      body.donorName,
      phone:          body.phone || null,
      email:          body.email || null,
      donationType:   body.donationType || "one_time",
      donationAmount: body.donationAmount || null,
      message:        body.message || null,
    });

    // Notify reviewers so the bell counter ticks up immediately.
    try {
      await notifyRole(["admin", "principal", "trust_accountant"], {
        type: "donor_form",
        title: `New donor enquiry · ${submission.donorName}`,
        description: submission.donationAmount
          ? `Wants to give ₹${Number(submission.donationAmount).toLocaleString("en-IN")} (${submission.donationType})`
          : `${submission.donationType} donation enquiry`,
        redirectUrl: `?screen=donors&submission=${submission.id}`,
      });
    } catch {}

    try { await logAudit("Public form", "Donor form submission", `${submission.id} · ${submission.donorName}`); } catch {}
    return NextResponse.json({ ok: true, submission });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}

// GET /api/donor-form?status=pending — review queue.
export async function GET(req) {
  const session = await getSession();
  if (!session || !REVIEW_ROLES.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;
  const submissions = await listDonorFormSubmissions({ status, limit: 200 });
  return NextResponse.json({ ok: true, submissions });
}

// PATCH /api/donor-form { id, status } — accept | reject. Accept also
// inserts a real donor row so the submission converts into the live
// donor pipeline; reject just flips the status.
export async function PATCH(req) {
  const session = await getSession();
  if (!session || !REVIEW_ROLES.has(session.role)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }
  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.id || !body?.status) {
    return NextResponse.json({ ok: false, error: "id and status required" }, { status: 400 });
  }

  // Read the submission first so we have its details for the donor cascade.
  const all = await listDonorFormSubmissions({});
  const before = all.find((s) => s.id === body.id);
  if (!before) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  let updated;
  try {
    updated = await updateDonorFormSubmissionStatus(body.id, body.status);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
  if (!updated) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  // On accept, fan out into:
  //   1. A live donor row so they show up on the Donors screen.
  //   2. A real donation receipt for the pledged amount so the money
  //      lands in the Money Control "Collected" stream and counts as
  //      earned income (not just a pledge).
  // Both are best-effort — the submission still gets accepted even if
  // the cascades fail (admin can re-do them manually from Donors).
  if (body.status === "accepted" && before.status !== "accepted") {
    let createdDonor = null;
    try {
      createdDonor = await addDonor({
        name: before.donorName,
        email: before.email || null,
        phone: before.phone || null,
        committed: before.donationAmount || 0,
        next: null,
        notes: before.message || `Accepted from public form · ${before.donationType}`,
      });
    } catch (e) {
      console.warn(`[donor-form] addDonor cascade failed: ${e.message}`);
    }

    // Record the receipt only when we have a positive amount AND the
    // donor row was created. The receipt's `addDonorReceipt` writes to
    // donor_receipts (which Money reads as Collected income), updates
    // the donor's lifetime + last gift, and stamps the audit trail.
    if (createdDonor && (before.donationAmount || 0) > 0) {
      try {
        await recordDonation(createdDonor.id, {
          amount: before.donationAmount,
          method: "Online",
          memo: `Public form · ${before.donationType}${before.message ? ` · ${String(before.message).slice(0, 60)}` : ""}`,
        });
      } catch (e) {
        console.warn(`[donor-form] recordDonation cascade failed: ${e.message}`);
      }
    }
  }

  try {
    await logAudit(
      session.name || "User",
      body.status === "accepted" ? "Accepted donor submission" : "Rejected donor submission",
      `${updated.id} · ${updated.donorName}`
    );
  } catch {}
  return NextResponse.json({ ok: true, submission: updated });
}
