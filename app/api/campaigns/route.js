import { NextResponse } from "next/server";
import { addCampaign, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function POST(req) {
  const session = await getSession();
  const actor = session?.name || "Principal";
  let body; try { body = await req.json(); } catch { body = null; }
  try {
    const campaign = await addCampaign(body || {});
    try { await logAudit(actor, "Created campaign", `${campaign.id} ${campaign.name} · goal ₹${campaign.goal}`); } catch {}
    return NextResponse.json({ ok: true, campaign });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 400 });
  }
}
