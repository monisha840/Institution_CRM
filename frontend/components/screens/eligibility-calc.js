// Attendance shortage & exam eligibility — pure computation.
//
// Indian affiliating universities gate exam entry on a minimum attendance
// percentage (75% is the near-universal bar; between that and a lower floor a
// student may apply for *condonation*, below the floor they are detained).
//
// Three denominator rules make or break this file:
//
//   1. The percentage SO FAR divides by the days the class has actually been
//      registered, not by the planned term. Dividing day 30 of a 61-day term
//      by 61 reports the whole institution at ~45% and is how a register like
//      this loses its credibility in the first minute of a demo.
//   2. The planned term is used ONLY inside the forward projection.
//   3. Days elapsed is a property of the CLASS, not of the student. Counting a
//      student's own rows would hand a mid-term admission a flattering
//      denominator and promise them remaining days that will not happen.
//
// This is also why lib/format.js `attendanceFromLogs` is deliberately not
// reused: it divides by the planned term, rounds to a whole number (74.6%
// becomes 75% and an ineligible student is declared eligible at the bar), and
// counts every non-'absent' status — including unrecognised ones — as present.
// Three screens depend on that behaviour, so it is left untouched.

/** Statuses that put the student physically in class. */
export const ATTENDED_STRICT = new Set(["present", "late", "parent_drop"]);

/** Strict plus sanctioned absence (medical / on-duty). */
export const ATTENDED_LENIENT = new Set(["present", "late", "parent_drop", "leave"]);

export const POLICIES = [
  { key: "strict",  label: "Strict",  hint: "Only days physically attended count. Sanctioned leave does not." },
  { key: "lenient", label: "Lenient", hint: "Medical and on-duty leave count as attended." },
];

export const DEFAULT_BANDS = { bar: 75, floor: 65 };

const round1 = (n) => Math.round(n * 10) / 10;

/* ------------------------------------------------------------------------
   Calendar — what days this class was actually registered on.
   ------------------------------------------------------------------------ */

/**
 * Distinct non-holiday dates present in a set of logs, plus the weekdays the
 * institution appears to run. Deriving the working week from the register
 * itself avoids inventing a setting that does not exist.
 */
export function deriveCalendar(logs, holidaySet) {
  const dates = new Set();
  for (const l of logs) {
    const d = l?.date;
    if (!d) continue;
    if (holidaySet && holidaySet.has(d)) continue;
    dates.add(d);
  }
  const sorted = [...dates].sort();
  const weekdays = new Set();
  for (const d of sorted) {
    const t = Date.parse(`${d}T00:00:00Z`);
    if (!Number.isNaN(t)) weekdays.add(new Date(t).getUTCDay());
  }
  return {
    dates: sorted,
    elapsed: sorted.length,
    firstDate: sorted[0] || null,
    lastDate: sorted[sorted.length - 1] || null,
    weekdays: weekdays.size ? weekdays : new Set([1, 2, 3, 4, 5, 6]),
  };
}

/**
 * Working days strictly after `fromISO` up to and including `toISO`, skipping
 * declared holidays and any weekday the institution does not run.
 * Pure UTC arithmetic — parsing a bare date string locally shifts the day
 * either side of midnight and desynchronises server and client renders.
 */
export function countWorkingDays(fromISO, toISO, { holidaySet, weekdays } = {}) {
  const start = Date.parse(`${fromISO}T00:00:00Z`);
  const end = Date.parse(`${toISO}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  const days = weekdays && weekdays.size ? weekdays : new Set([1, 2, 3, 4, 5, 6]);
  let n = 0;
  for (let t = start + 86400000; t <= end; t += 86400000) {
    const d = new Date(t);
    if (!days.has(d.getUTCDay())) continue;
    if (holidaySet && holidaySet.has(d.toISOString().slice(0, 10))) continue;
    n++;
  }
  return n;
}

/* ------------------------------------------------------------------------
   Per-student tally
   ------------------------------------------------------------------------ */

/**
 * One pass over a student's logs, counting both policies together.
 * An unrecognised or missing status counts as NOT attended under either
 * policy and is reported separately — silently treating it as present is
 * precisely the bug this module exists to avoid.
 */
export function tally(logs, holidaySet) {
  const t = {
    counted: 0,
    attendedStrict: 0, attendedLenient: 0,
    present: 0, late: 0, parentDrop: 0, leave: 0, absent: 0, unknown: 0,
    absences: [],
    longestAbsentRun: 0,
  };
  let run = 0;

  for (const l of logs) {
    if (!l?.date) continue;
    if (holidaySet && holidaySet.has(l.date)) continue;
    t.counted++;
    const st = l.attendance;

    if (ATTENDED_STRICT.has(st)) {
      t.attendedStrict++; t.attendedLenient++;
      if (st === "present") t.present++;
      else if (st === "late") t.late++;
      else t.parentDrop++;
      run = 0;
    } else if (st === "leave") {
      t.attendedLenient++; t.leave++;
      t.absences.push({ date: l.date, status: "leave", reason: l.leaveReason || "" });
      run = 0;                       // sanctioned — does not extend an absence run
    } else if (st === "absent") {
      t.absent++;
      t.absences.push({ date: l.date, status: "absent", reason: l.leaveReason || "" });
      run++;
      if (run > t.longestAbsentRun) t.longestAbsentRun = run;
    } else {
      t.unknown++;
      run = 0;
    }
  }
  t.absences.sort((a, b) => a.date.localeCompare(b.date));
  return t;
}

/* ------------------------------------------------------------------------
   Projection — the reason this screen exists
   ------------------------------------------------------------------------ */

/**
 * Given what a student has banked and how many working days remain before the
 * bar is applied, work out whether they can still clear it and what it costs.
 *
 *   pctSoFar      attended ÷ days the class has been registered
 *   maxAttainable the final figure if they attend every remaining day
 *   needed        fewest remaining days that reach the bar
 *   shortfall     days they would need that do not exist
 *   recoverable   shortfall === 0
 */
export function project({ attended, elapsed, remaining, plannedTotal, bar }) {
  // The term is whatever is larger: what the admin planned, or what has
  // already happened plus what is left. A planned total smaller than the days
  // already registered is a misconfiguration, not a reason to report >100%.
  const total = Math.max(plannedTotal || 0, elapsed + remaining, elapsed);

  const pctSoFar = elapsed > 0 ? round1((attended / elapsed) * 100) : null;
  const maxAttainable = total > 0 ? round1(((attended + remaining) / total) * 100) : null;
  const minIfNoneMore = total > 0 ? round1((attended / total) * 100) : null;

  const rawNeeded = Math.ceil((bar / 100) * total - attended);
  const needed = Math.min(remaining, Math.max(0, rawNeeded));
  const shortfall = Math.max(0, rawNeeded - remaining);

  return {
    total,
    remaining,
    pctSoFar,
    maxAttainable,
    minIfNoneMore,
    needed,
    shortfall,
    slack: Math.max(0, remaining - needed),
    recoverable: shortfall === 0,
  };
}

/* ------------------------------------------------------------------------
   Bands
   ------------------------------------------------------------------------ */

export function bandOf(pct, bands = DEFAULT_BANDS) {
  if (pct == null) return "unknown";
  if (pct >= bands.bar) return "eligible";
  if (pct >= bands.floor) return "condonation";
  return "detained";
}

export const BAND_META = {
  eligible:    { label: "Eligible",    tone: "ok",   desc: "Clears the bar — may sit the examination." },
  condonation: { label: "Condonation", tone: "warn", desc: "Short of the bar but above the floor — may apply for condonation." },
  detained:    { label: "Detained",    tone: "bad",  desc: "Below the floor — not permitted to sit the examination." },
  unknown:     { label: "No register", tone: "",     desc: "No attendance has been marked for this student." },
};

/* ------------------------------------------------------------------------
   Register
   ------------------------------------------------------------------------ */

/**
 * roster        students [{ id, name, cls, ... }]
 * logsByStudent Map(studentId → logs[])
 * calendarFor   (cls) => Calendar for that class
 * plannedFor    (cls) => planned working days, or null
 * remainingFor  (cls) => working days left before the bar applies
 * holidaySet    Set of "YYYY-MM-DD"
 *
 * Every row carries BOTH policies so switching costs nothing, with `pct`,
 * `band` and `projection` resolving to the active one.
 */
export function buildRegister({
  roster, logsByStudent, calendarFor, plannedFor, remainingFor,
  holidaySet, bands = DEFAULT_BANDS, policy = "strict",
}) {
  const rows = [];

  for (const s of roster) {
    const logs = logsByStudent.get(s.id) || [];
    const t = tally(logs, holidaySet);
    const cal = calendarFor(s.cls);

    // Class-level, so classmates share a denominator and a mid-term joiner is
    // visible as a register gap rather than as a better attendance record.
    const elapsed = cal.elapsed;
    const plannedTotal = plannedFor(s.cls);
    const remaining = remainingFor(s.cls);

    const mk = (attended) => {
      const projection = project({ attended, elapsed, remaining, plannedTotal, bar: bands.bar });
      // No register at all → no percentage. Reporting 0% would brand the
      // student detained for the office's failure to mark.
      const pct = t.counted === 0 ? null : projection.pctSoFar;
      return { attended, pct, band: bandOf(pct, bands), projection };
    };

    const strict = mk(t.attendedStrict);
    const lenient = mk(t.attendedLenient);
    const active = policy === "lenient" ? lenient : strict;

    rows.push({
      id: s.id,
      name: s.name,
      cls: s.cls,
      parent: s.parent ?? null,
      phone: s.phone ?? null,
      tally: t,
      elapsed,
      ownMarked: t.counted,
      unmarkedDays: Math.max(0, elapsed - t.counted),
      plannedTotal,
      remaining,
      strict,
      lenient,
      pct: active.pct,
      band: active.band,
      attended: active.attended,
      projection: active.projection,
      // How much the two readings disagree. A wide gap means sanctioned leave
      // is carrying the student, which is the population an examinations
      // officer actually argues about.
      policyGap: strict.pct != null && lenient.pct != null ? round1(lenient.pct - strict.pct) : null,
      changesBand: strict.band !== lenient.band,
      logs,
    });
  }
  return rows;
}

/** Worst first — this is a triage list, and anyone who cannot recover leads. */
export function sortRegister(rows, key = "pct", dir = "asc") {
  const sign = dir === "desc" ? -1 : 1;
  const val = (r) => {
    switch (key) {
      case "name":   return r.name || "";
      case "cls":    return r.cls || "";
      case "needed": return r.projection.needed ?? 0;
      case "absent": return r.tally.absent;
      default:       return r.pct;
    }
  };
  return [...rows].sort((a, b) => {
    // Unrecoverable students float to the top whatever the sort.
    const au = a.pct != null && !a.projection.recoverable;
    const bu = b.pct != null && !b.projection.recoverable;
    if (au !== bu) return au ? -1 : 1;

    const av = val(a); const bv = val(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;          // "no register" always last
    if (bv == null) return -1;
    if (typeof av === "string") return sign * av.localeCompare(bv, undefined, { numeric: true });
    return sign * (av - bv);
  });
}

export function summarise(rows) {
  const out = {
    total: rows.length,
    eligible: 0, condonation: 0, detained: 0, unknown: 0,
    atRisk: 0, unrecoverable: 0, bandChangers: 0, registerGaps: 0,
  };
  for (const r of rows) {
    out[r.band] = (out[r.band] || 0) + 1;
    if (r.changesBand) out.bandChangers++;
    if (r.unmarkedDays > 0) out.registerGaps++;
    if (r.band !== "eligible" && r.band !== "unknown") {
      out.atRisk++;
      if (!r.projection.recoverable) out.unrecoverable++;
    }
  }
  return out;
}
