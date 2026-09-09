import { NextResponse } from "next/server";
import { readAllData, updateStudent, logAudit } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Tiny CSV parser — handles quoted cells with commas inside. Same shape as
// the students-import parser. Kept inline here so this route is self-
// contained and doesn't accidentally drift if the other parser changes.
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

// Normalise a name for matching — strip dots / spaces / case so
// "DEVESH.E" and "Devesh E" match the same student record. Indian
// rosters routinely have dots, periods after initials, double spaces,
// and inconsistent capitalisation; we collapse all of those.
function normaliseName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Pretty up the user's route input — they'll often type "r1" instead of
// "R1" or accidentally leave whitespace.
function normaliseRoute(s) {
  return String(s || "").trim().toUpperCase();
}

// "—" / "-" / "none" / "" all mean "no transport on this side"
const NO_TRANSPORT = new Set(["", "—", "-", "none", "no", "n/a", "na", "nil"]);
function isBlank(s) {
  return NO_TRANSPORT.has(String(s || "").trim().toLowerCase());
}

export async function POST(req) {
  const session = await getSession();
  const role = session?.role;
  const allowed = role === "admin" || role === "principal" || role === "school_accountant" || role === "teacher" || role === "transport_manager";
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "Only staff can bulk-assign transport." },
      { status: 403 }
    );
  }
  const actor = session?.name || "Staff";

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

  // Locate columns by header keyword — gives the user flexibility on the
  // exact wording. Required: a name/student column. Optional everything else.
  const header = rows[0].map((h) => h.toLowerCase().trim());
  const findCol = (...keywords) => header.findIndex((h) =>
    keywords.some((k) => h.includes(k))
  );
  const ni  = findCol("name", "student");
  const mri = findCol("morning route", "morning_route", "am route", "am_route", "morning bus");
  const msi = findCol("morning stop", "morning_stop", "am stop", "am_stop");
  const eri = findCol("evening route", "evening_route", "pm route", "pm_route", "evening bus");
  const esi = findCol("evening stop", "evening_stop", "pm stop", "pm_stop");

  if (ni === -1) {
    return NextResponse.json(
      { ok: false, error: "CSV needs a Name (or Student) column to match each row to a student." },
      { status: 400 }
    );
  }
  if (mri === -1 && eri === -1) {
    return NextResponse.json(
      { ok: false, error: "CSV needs at least one of: Morning Route / Evening Route." },
      { status: 400 }
    );
  }

  // Build lookup tables: name → student, code → route. We load the
  // current dataset once so we don't hammer Supabase per row.
  const all = await readAllData();
  const students = (all.addedStudents || []).filter((s) => (s.status ?? "active") !== "archived");
  const routes   = all.routes || [];

  const byName = new Map();
  for (const s of students) {
    const key = normaliseName(s.name);
    if (!key) continue;
    // First occurrence wins; if the school has duplicate names the admin
    // can fix with explicit student-id columns later.
    if (!byName.has(key)) byName.set(key, s);
  }
  const routeByCode = new Map();
  for (const r of routes) {
    if (r.code) routeByCode.set(normaliseRoute(r.code), r);
  }

  const updated = [];
  const errors = [];

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const nameRaw = (cells[ni] || "").trim();
    if (!nameRaw) continue;
    const student = byName.get(normaliseName(nameRaw));
    if (!student) {
      errors.push({ row: r + 1, name: nameRaw, reason: "Student not found in roster" });
      continue;
    }

    const patch = { id: student.id };
    let touched = false;

    // Morning leg.
    if (mri !== -1) {
      const rawRoute = (cells[mri] || "").trim();
      if (isBlank(rawRoute)) {
        patch.transport = "—";
        patch.pickupStop = null;
        touched = true;
      } else {
        const code = normaliseRoute(rawRoute);
        const route = routeByCode.get(code);
        if (!route) {
          errors.push({ row: r + 1, name: nameRaw, reason: `Morning route '${rawRoute}' not in routes table` });
          continue;
        }
        // The morning picker on Admission shows routes tagged morning OR
        // both. Enforce the same here so a misclassified evening-only
        // route can't be assigned as a morning bus.
        const dir = route.direction || "both";
        if (dir !== "morning" && dir !== "both") {
          errors.push({ row: r + 1, name: nameRaw, reason: `Route ${code} is tagged '${dir}', cannot use as morning route` });
          continue;
        }
        patch.transport  = code;
        patch.pickupStop = msi !== -1 ? (cells[msi] || "").trim() || null : null;
        touched = true;
      }
    }

    // Evening leg.
    if (eri !== -1) {
      const rawRoute = (cells[eri] || "").trim();
      if (isBlank(rawRoute)) {
        patch.transportEvening = "—";
        patch.pickupStopEvening = null;
        touched = true;
      } else {
        const code = normaliseRoute(rawRoute);
        const route = routeByCode.get(code);
        if (!route) {
          errors.push({ row: r + 1, name: nameRaw, reason: `Evening route '${rawRoute}' not in routes table` });
          continue;
        }
        const dir = route.direction || "both";
        if (dir !== "evening" && dir !== "both") {
          errors.push({ row: r + 1, name: nameRaw, reason: `Route ${code} is tagged '${dir}', cannot use as evening route` });
          continue;
        }
        patch.transportEvening  = code;
        patch.pickupStopEvening = esi !== -1 ? (cells[esi] || "").trim() || null : null;
        touched = true;
      }
    }

    if (!touched) continue;

    try {
      const out = await updateStudent(student.id, patch);
      if (out) {
        updated.push({
          id: student.id,
          name: student.name,
          morning: patch.transport ?? null,
          morningStop: patch.pickupStop ?? null,
          evening: patch.transportEvening ?? null,
          eveningStop: patch.pickupStopEvening ?? null,
        });
      }
    } catch (e) {
      errors.push({ row: r + 1, name: nameRaw, reason: e.message || "Update failed" });
    }
  }

  try {
    await logAudit(
      actor,
      "Bulk assigned transport",
      `${updated.length} student${updated.length === 1 ? "" : "s"} updated${errors.length ? ` · ${errors.length} skipped` : ""}`
    );
  } catch {}

  return NextResponse.json({
    ok: true,
    count: updated.length,
    updated,
    errors,
  });
}
