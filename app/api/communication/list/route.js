import { NextResponse } from "next/server";
import { addRecipientList, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Validate Indian 10-digit mobile, must start with 6/7/8/9.
function normalisePhone(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  if (digits.length !== 10 || !/^[6-9]/.test(digits)) return null;
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

// Accepts a name + an array of {name, phone} OR a CSV string with "Name,Phone"
// header and rows. Strips invalid phones and dedupes.
export async function POST(req) {
  const session = await getSession();
  const actor = session?.name || "Principal";

  let body; try { body = await req.json(); } catch { body = null; }
  const listName = String(body?.name || "").trim() || "Imported list";

  let raw = [];
  if (Array.isArray(body?.contacts)) {
    raw = body.contacts;
  } else if (typeof body?.csv === "string") {
    raw = parseCsv(body.csv);
  } else {
    return NextResponse.json({ ok: false, error: "Provide contacts[] or csv string" }, { status: 400 });
  }

  const seen = new Set();
  const accepted = [];
  const rejected = [];
  for (const r of raw) {
    const phone = normalisePhone(r.phone);
    const name = String(r.name || "").trim();
    if (!phone) { rejected.push({ name, phone: r.phone, reason: "invalid phone" }); continue; }
    if (seen.has(phone)) { rejected.push({ name, phone, reason: "duplicate" }); continue; }
    seen.add(phone);
    accepted.push({ name: name || "—", phone });
  }
  if (accepted.length === 0) {
    return NextResponse.json({
      ok: false,
      error: `No valid contacts. ${rejected.length} rejected (need 10-digit Indian mobile starting with 6/7/8/9).`,
      rejected,
    }, { status: 400 });
  }
  try {
    const list = await addRecipientList({ name: listName, contacts: accepted });
    try { await logAudit(actor, "Imported recipient list", `${list.id} ${list.name} · ${accepted.length} valid${rejected.length ? `, ${rejected.length} rejected` : ""}`); } catch {}
    return NextResponse.json({ ok: true, list, accepted: accepted.length, rejected });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "Failed" }, { status: 500 });
  }
}

function parseCsv(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  // Detect header — if first line includes "name" or "phone" case-insensitively, skip.
  const first = lines[0].toLowerCase();
  const start = (first.includes("name") || first.includes("phone")) ? 1 : 0;
  const out = [];
  for (let i = start; i < lines.length; i++) {
    const cells = splitCsvRow(lines[i]);
    if (cells.length === 0) continue;
    out.push({ name: cells[0] || "", phone: cells[1] || "" });
  }
  return out;
}

function splitCsvRow(line) {
  // Simple CSV splitter — handles quoted commas.
  const out = [];
  let cur = ""; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === ",") { out.push(cur.trim()); cur = ""; }
      else if (c === '"') inQ = true;
      else cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}
