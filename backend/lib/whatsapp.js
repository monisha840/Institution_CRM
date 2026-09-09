// Direct Evolution API bridge — sends WhatsApp messages straight from the
// CRM backend, no n8n in between.
//
// Env vars (set in .env.local):
//   EVOLUTION_API_URL   = https://message.sirahagents.com   (no trailing slash)
//   EVOLUTION_API_KEY   = <per-instance API key from Sirah Messenger dashboard>
//   EVOLUTION_INSTANCE  = School_Crm
//
// Why fire-and-forget: a fee payment / reminder is the user-facing happy
// path; we never want a downstream WhatsApp glitch to block or fail it.
// Every attempt — success, skip, or failure — is recorded to audit_log
// so admins can see what got sent and what didn't in the Audit screen.
import { logAudit } from "./db";

// India numbers: strip everything except digits, drop leading 0, prefix 91
// if missing. Returns null if the result isn't a 12-digit Indian number
// (so we don't burn a WhatsApp credit on a bad row).
function normalizeIndianPhone(raw) {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10 && /^[6-9]/.test(d)) d = "91" + d;
  if (d.length !== 12 || !d.startsWith("91")) return null;
  return d;
}

function evolutionConfig() {
  const base = (process.env.EVOLUTION_API_URL || "").replace(/\/+$/, "");
  const key = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  if (!base || !key || !instance) return null;
  return { base, key, instance };
}

// Low-level POST to Evolution. 8s timeout (image sends take a couple of
// seconds because Evolution streams the upload to WhatsApp).
async function evoPost(path, body) {
  const cfg = evolutionConfig();
  if (!cfg) return { ok: false, skipped: "Evolution env vars not set" };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${cfg.base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: cfg.key,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      return { ok: false, status: res.status, body: text.slice(0, 400) };
    }
    return { ok: true, body: text };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, error: e.message };
  }
}

// Best-effort audit write. We never want an audit failure to block the
// WhatsApp send or the surrounding API response, so swallow exceptions.
async function recordAudit(event, status, detail) {
  try {
    await logAudit("WhatsApp", `WhatsApp · ${event} · ${status}`, detail);
  } catch {}
}

// Public entry point — keeps the same signature the route files already use,
// so pay/route.js, pay-online/route.js, send-qr/route.js, remind/route.js
// and broadcast/route.js don't need any edits when we switch from n8n to
// direct Evolution.
//
//   notifyWhatsApp("fee_paid",     { phone, imageUrl, caption, ... })
//   notifyWhatsApp("fee_qr_send",  { phone, imageUrl, caption, ... })
//   notifyWhatsApp("fee_reminder", { phone, message, ... })
//   notifyWhatsApp("broadcast",    { phone, message, ... })
//   notifyWhatsApp("test",         { phone, message, ... })
//
// Returns { ok, status?, body?, error?, skipped?, phone? }. Every attempt
// (success, skip, or failure) is recorded to audit_log so admins can see
// delivery history in the Audit screen.
export async function notifyWhatsApp(event, payload = {}) {
  const cfg = evolutionConfig();
  if (!cfg) {
    const detail = `${event} skipped: Evolution env vars not set (need EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE)`;
    console.warn(`[whatsapp] ${detail}`);
    await recordAudit(event, "skipped", detail);
    return { ok: false, skipped: "Evolution env vars not set" };
  }

  const phone = normalizeIndianPhone(payload.phone);
  if (!phone) {
    const detail = `${event} skipped: invalid phone "${payload.phone || ""}"`;
    await recordAudit(event, "skipped", detail);
    return { ok: false, skipped: "no valid phone" };
  }

  // Image events: fee_paid (rendered receipt PNG), fee_qr_send (UPI QR URL).
  // All other event names are treated as text-only.
  const isImageEvent = event === "fee_paid" || event === "fee_qr_send";

  let result;
  if (isImageEvent) {
    if (!payload.imageUrl) {
      const detail = `${event} skipped: no imageUrl in payload`;
      console.warn(`[whatsapp] ${detail}`);
      await recordAudit(event, "skipped", detail);
      return { ok: false, skipped: "no imageUrl" };
    }
    // Evolution v2 sendMedia. `media` accepts a URL or raw base64 (no
    // "data:image/png;base64," prefix — we strip that in receipt-image.js).
    result = await evoPost(`/message/sendMedia/${cfg.instance}`, {
      number: phone,
      mediatype: "image",
      mimetype: "image/png",
      media: payload.imageUrl,
      caption: payload.caption || "",
      fileName: `receipt-${Date.now()}.png`,
    });
  } else {
    // Text-only path (fee_reminder, broadcast, test).
    if (!payload.message) {
      const detail = `${event} skipped: no message in payload`;
      console.warn(`[whatsapp] ${detail}`);
      await recordAudit(event, "skipped", detail);
      return { ok: false, skipped: "no message" };
    }
    result = await evoPost(`/message/sendText/${cfg.instance}`, {
      number: phone,
      text: payload.message,
    });
  }

  if (result.ok) {
    await recordAudit(event, "sent", `phone=${phone}`);
  } else {
    const err = result.body || result.error || result.skipped || "unknown";
    const detail = `phone=${phone} · ${result.status || "ERR"}: ${String(err).slice(0, 300)}`;
    console.warn(`[whatsapp] ${event} → ${detail}`);
    await recordAudit(event, "failed", detail);
  }
  return { ...result, phone };
}

// Read-only diagnostic — reports whether each env var is present (without
// revealing the actual values). Used by the admin diagnostic endpoint so
// staff can verify the production VPS has the credentials wired in.
export function whatsappEnvStatus() {
  return {
    EVOLUTION_API_URL: !!process.env.EVOLUTION_API_URL,
    EVOLUTION_API_KEY: !!process.env.EVOLUTION_API_KEY,
    EVOLUTION_INSTANCE: !!process.env.EVOLUTION_INSTANCE,
    configured: !!evolutionConfig(),
  };
}
