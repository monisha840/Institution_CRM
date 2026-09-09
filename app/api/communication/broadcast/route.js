import { NextResponse } from "next/server";
import { addBroadcast, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { notifyWhatsApp } from "@/lib/whatsapp";

// Hard cap so a runaway broadcast can't time out the route or burn through
// the Evolution API quota in one shot. The Communication screen lets staff
// pick a smaller audience if they hit this.
const MAX_WHATSAPP_RECIPIENTS = 500;

export async function POST(req) {
  const session = await getSession();
  const actor = session?.name || "Principal";

  let body; try { body = await req.json(); } catch { body = null; }
  if (!body?.message?.trim()) {
    return NextResponse.json({ ok: false, error: "Message is required" }, { status: 400 });
  }
  if (!Number.isFinite(Number(body.sent)) || Number(body.sent) < 0) {
    return NextResponse.json({ ok: false, error: "Audience size must be a positive number" }, { status: 400 });
  }
  const channel = body.channel || "in_app";
  const message = body.message.trim();
  const sent = Number(body.sent) || 0;

  // WhatsApp channel actually fires the message to each parent. Other
  // channels (in_app) keep the existing optimistic path — the in-app
  // notification surfaces via the parent dashboard.
  let delivered = sent;
  let failed = 0;
  if (channel === "whatsapp") {
    const recipients = Array.isArray(body.recipients) ? body.recipients : [];
    if (recipients.length === 0) {
      return NextResponse.json({ ok: false, error: "No recipients provided for WhatsApp broadcast" }, { status: 400 });
    }
    if (recipients.length > MAX_WHATSAPP_RECIPIENTS) {
      return NextResponse.json({
        ok: false,
        error: `Too many recipients (${recipients.length}). Split into batches of ${MAX_WHATSAPP_RECIPIENTS} or fewer.`,
      }, { status: 400 });
    }
    // Fan out in parallel. notifyWhatsApp already audit-logs every attempt,
    // so admins can inspect per-message outcomes in the Audit screen.
    const results = await Promise.allSettled(
      recipients.map((r) => notifyWhatsApp("broadcast", { phone: r.phone, message }))
    );
    delivered = results.filter((r) => r.status === "fulfilled" && r.value?.ok).length;
    failed = recipients.length - delivered;
  }

  try {
    const broadcast = await addBroadcast({
      campaign: body.campaign || "Manual broadcast",
      channel,
      audience: body.audience || "all",
      audienceLabel: body.audienceLabel || body.audience || "All parents",
      message,
      sent,
      delivered,
    });
    try {
      const summary = channel === "whatsapp"
        ? `${broadcast.campaign} → ${broadcast.audienceLabel} · ${delivered}/${sent} delivered · ${failed} failed`
        : `${broadcast.campaign} → ${broadcast.audienceLabel} · ${sent} ${channel}`;
      await logAudit(actor, "Sent broadcast", summary);
    } catch {}
    return NextResponse.json({ ok: true, broadcast, delivered, failed });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed to send" }, { status: 500 });
  }
}
