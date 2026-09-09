import { NextResponse } from "next/server";
import { addStaff, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Bulk-import staff (teachers + ops + interns) from a CSV/Excel that the
// admin uploads on the Staff screen. Mirrors the Students importer: each
// row creates a staff record AND auto-provisions a login when the row
// has an email (the addStaff helper does that for us — see db.js).
//
// Same defence-in-depth as the Students importer: per-batch ID dedup,
// row-level error collection so a single bad row doesn't kill the import.

function parseCsv(text) {
  const rows = [];
  let i = 0, cell = "", row = [], inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      cell += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { row.push(cell); cell = ""; i++; continue; }
    if (c === "\n" || c === "\r") {
      if (cell.length || row.length) { row.push(cell); rows.push(row); row = []; cell = ""; }
      if (c === "\r" && text[i + 1] === "\n") i++;
      i++; continue;
    }
    cell += c; i++;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// Normalise a phone the same way /api/staff POST does — strip non-digits,
// drop +91 / 91 / 0 prefixes, validate 10 digits starting 6-9. Returns
// "+91 XXXXX XXXXX" or null on invalid (then we still keep the staff row
// but with phone = "—").
function formatIndianPhone(raw) {
  if (!raw) return "—";
  let digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  if (digits.length !== 10 || !/^[6-9]/.test(digits)) return null;
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

// Map case-insensitive role text to one of the three canonical buckets.
// Spelling variants ("teach", "intern" all collapse cleanly).
function normaliseRole(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "Teacher";
  if (s.startsWith("teach")) return "Teacher";
  if (s.startsWith("op") || s === "admin staff" || s === "office") return "Ops";
  if (s.startsWith("intern")) return "Intern";
  return "Teacher";
}

// Unique STF-XXXX id per batch. addStaff falls back to its own generator
// when row.id is missing, but with a 9000-slot pool 200+ rows hit the
// birthday paradox (~30 collisions on 250). We mint here with a wider
// pool and a per-batch Set to guarantee uniqueness across one import.
function newStaffId(taken) {
  for (let i = 0; i < 50; i++) {
    const id = `STF-${100000 + Math.floor(Math.random() * 900000)}`;
    if (!taken.has(id)) { taken.add(id); return id; }
  }
  const id = `STF-${100000 + Math.floor(Math.random() * 900000)}-${Date.now().toString(36).slice(-4)}`;
  taken.add(id);
  return id;
}

// Deterministic per-teacher default password from the first name —
// principal asked for "Aakash@123" style so the password is easy to
// share verbally. First name's first letter uppercased, rest
// lowercased, then "@123". Falls back to "Teacher@123" if the row
// name is unparseable (empty / only punctuation).
function derivePasswordFromName(name) {
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  // Strip any non-letter junk (dots, initials like "S.K." would leave
  // "S" which is still valid).
  const cleaned = first.replace(/[^A-Za-z]/g, "");
  if (!cleaned) return "Teacher@123";
  const capitalised = cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
  return `${capitalised}@123`;
}

export async function POST(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  if (!["admin", "principal"].includes(session.role)) {
    return NextResponse.json({ ok: false, error: "Only admin / principal can bulk-import staff." }, { status: 403 });
  }
  const actor = session.name || "Admin";

  let body; try { body = await req.json(); } catch { body = null; }
  const csv = body?.csv;
  if (typeof csv !== "string" || !csv.trim()) {
    return NextResponse.json({ ok: false, error: "csv body required" }, { status: 400 });
  }

  let rows;
  try {
    rows = parseCsv(csv).filter((r) => r.length && r.some((c) => c.trim()));
  } catch (e) {
    return NextResponse.json({ ok: false, error: `CSV parse failed: ${e.message}` }, { status: 400 });
  }
  if (rows.length < 2) {
    return NextResponse.json({ ok: false, error: "Need at least one header row and one data row" }, { status: 400 });
  }

  const header = rows[0].map((h) => h.toLowerCase().trim());
  const idx = (...keys) => header.findIndex((h) => keys.some((k) => h.includes(k)));
  const ni  = idx("name");
  const ei  = idx("email");
  const phi = idx("phone", "mobile");
  const ri  = idx("role", "designation");
  const di  = idx("dept", "department");
  const si  = idx("salary", "ctc");
  const ji  = idx("join", "doj", "start");
  if (ni === -1) {
    return NextResponse.json({ ok: false, error: "CSV needs a Name column" }, { status: 400 });
  }

  const created = [];
  const logins = [];
  const errors = [];
  const issuedIds = new Set();

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const name = (cells[ni] || "").trim();
    if (!name) continue;

    const rawPhone = phi !== -1 ? (cells[phi] || "").trim() : "";
    const formattedPhone = rawPhone ? formatIndianPhone(rawPhone) : "—";
    // Bad-phone rows still get imported, just without a phone — the
    // teacher can be edited later. Skipping the whole row would lose
    // the staff record for a typo.
    const phone = formattedPhone === null ? "—" : formattedPhone;

    const email = ei !== -1 ? String(cells[ei] || "").trim() : "";
    const role  = normaliseRole(ri !== -1 ? cells[ri] : "");
    const dept  = di !== -1 ? String(cells[di] || "").trim() : "";
    const salary = si !== -1 ? Math.max(0, Math.floor(Number(String(cells[si]).replace(/[^\d]/g, "")) || 0)) : 0;
    const joining = ji !== -1 ? String(cells[ji] || "").trim() : "";

    const payload = {
      id: newStaffId(issuedIds),
      name,
      role,
      dept: dept || (role === "Teacher" ? "Academics" : role === "Ops" ? "Operations" : "Internship"),
      phone,
      email: email || null,
      joiningDate: joining || undefined,
      salary,
      attendance: 0,
      tasks: 0,
      // Per-teacher derived password (Aakash@123 style) — addStaff
      // uses this in place of COMMON_TEACHER_PASSWORD when set. Only
      // applied when role === "Teacher" AND an email is present.
      defaultPassword: role === "Teacher" ? derivePasswordFromName(name) : undefined,
    };

    try {
      const saved = await addStaff(payload);
      // addStaff returns { ...staff, createdLogin } when it provisioned a
      // teacher login. Pull it off so the response can show the principal
      // the password they need to share.
      const { createdLogin, ...staffOnly } = saved;
      created.push(staffOnly);
      if (createdLogin) {
        logins.push({
          staffId: staffOnly.id,
          staffName: staffOnly.name,
          role: createdLogin.role,
          email: createdLogin.email,
          password: createdLogin.defaultPassword,
        });
      }
    } catch (e) {
      errors.push({ row: r + 1, name, reason: e.message || "Failed" });
    }
  }

  try {
    await logAudit(
      actor,
      "Bulk import staff",
      `${created.length} added · ${logins.length} teacher logins issued${errors.length ? ` · ${errors.length} skipped` : ""}`
    );
  } catch {}

  return NextResponse.json({
    ok: true,
    count: created.length,
    staff: created,
    logins,
    errors,
  });
}
