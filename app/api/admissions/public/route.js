import { NextResponse } from "next/server";
import { addEnquiry, logAudit } from "@/lib/db";

// Public endpoint — no session required. Parents submit the admission
// enquiry form at /admissionform; the row lands in the enquiries table
// where staff can review and convert via the existing Enquiries flow.
//
// Source-tagged as "Website-public" so admins can tell at a glance which
// enquiries came in over the public link vs. walk-ins / phone calls.

// Accept Roman numerals, Montessori labels, and plain digits — mirrors
// the import-route parser so anything the school's own admission form
// accepts also works here.
function classToNumber(raw) {
  const s = String(raw || "").trim().toUpperCase();
  if (!s) return 1;
  if (/^-?\d+$/.test(s)) return Math.max(1, Number(s));
  if (/^(PRE[- ]?MONT|PRE[- ]?KG|NURSERY|NUR)$/.test(s)) return 13;
  if (/^(LKG|KG1|MONT ?1|MONT ?I)$/.test(s)) return 14;
  if (/^(UKG|KG2|MONT ?2|MONT ?II)$/.test(s)) return 15;
  // Roman
  if (/^[IVX]+$/.test(s)) {
    const m = { I: 1, V: 5, X: 10 };
    let total = 0;
    for (let i = 0; i < s.length; i++) {
      const cur = m[s[i]], nxt = m[s[i + 1]];
      if (nxt && cur < nxt) total -= cur; else total += cur;
    }
    if (total > 0 && total < 100) return total;
  }
  return 1;
}

function formatIndianPhone(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  if (digits.length !== 10 || !/^[6-9]/.test(digits)) return null;
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

// Crude rate limiter: at most N submissions per IP per window. Lives
// in-process so it resets on every deploy, which is fine for a school
// trickle — the bigger goal is to block someone hammering the endpoint
// from a script. Map key = IP, value = array of recent timestamps.
const SUBMISSION_HISTORY = new Map();
const RATE_LIMIT = { count: 5, windowMs: 60 * 60 * 1000 }; // 5 per IP per hour

function checkRateLimit(ip) {
  const now = Date.now();
  const history = (SUBMISSION_HISTORY.get(ip) || []).filter(
    (t) => now - t < RATE_LIMIT.windowMs
  );
  if (history.length >= RATE_LIMIT.count) return false;
  history.push(now);
  SUBMISSION_HISTORY.set(ip, history);
  return true;
}

export async function POST(req) {
  // Honeypot check is implicit — the form has no hidden field today;
  // adding one is easy if abuse rises.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "unknown";

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { ok: false, error: "Too many submissions from this connection. Please try again in an hour or call the school directly." },
      { status: 429 }
    );
  }

  let body; try { body = await req.json(); } catch { body = null; }
  if (!body) return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });

  const studentName = String(body.studentName || "").trim();
  const parentName  = String(body.parentName  || "").trim();
  if (!studentName) return NextResponse.json({ ok: false, error: "Child's name is required" }, { status: 400 });
  if (!parentName)  return NextResponse.json({ ok: false, error: "Parent / guardian name is required" }, { status: 400 });

  const phone = formatIndianPhone(body.phone);
  if (!phone) {
    return NextResponse.json(
      { ok: false, error: "Phone must be a 10-digit Indian mobile starting with 6, 7, 8 or 9" },
      { status: 400 }
    );
  }

  const id = `ENQ-${1124 + Math.floor(Math.random() * 8999)}`;
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

  const row = {
    id,
    name: studentName,
    parent: parentName,
    phone,
    cls: classToNumber(body.cls),
    source: "Website-public",
    date: today,
    status: "New",
    dob:   body.dob || null,
    age:   null,
    street: body.address ? String(body.address).slice(0, 250) : null,
    city:   null,
    pin:    null,
    email:  body.email ? String(body.email).slice(0, 200) : null,
    notes:  body.notes ? String(body.notes).slice(0, 2000) : null,
  };

  try {
    const created = await addEnquiry(row);
    try {
      await logAudit(
        "Public form",
        "New enquiry (public)",
        `${created.id} ${created.name} · class ${row.cls} · IP ${ip}`
      );
    } catch {}
    return NextResponse.json({ ok: true, enquiry: { id: created.id, name: created.name } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Could not save your enquiry. Please try again." }, { status: 500 });
  }
}
