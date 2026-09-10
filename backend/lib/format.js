import { isCollege, vocab } from "./institution";
// Indian-format money helpers, used both server- and client-side.

// Full precision, Indian digit grouping: ₹12,09,205. Negatives put the
// sign before the symbol rather than after it, which is what toLocaleString
// on the raw number would have produced ("₹-12,09,205").
export const money = (n) => {
  const value = Number(n);
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  return `${sign}₹${Math.abs(value).toLocaleString("en-IN")}`;
};

/**
 * Compact money, Indian scale: ₹95.52L, ₹1.47Cr, ₹8.5K.
 *
 * Every comparison used to be against the signed value, so anything
 * negative fell straight through to the last line and printed raw:
 * a net surplus of -1209205 rendered "₹-1209205" next to a neatly
 * abbreviated "₹95.52L". Deficits are exactly the figure a principal
 * looks at hardest, and it was the one number in the app that came out
 * unformatted. Scale off the magnitude, put the sign in front.
 */
export const moneyK = (n) => {
  const value = Number(n);
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(2)}L`;
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)}K`;
  return `${sign}₹${abs.toLocaleString("en-IN")}`;
};

// Canonical list of fee categories the school collects. Order matters — it's
// the order they appear in pickers, in the receipt particulars, and in the
// Reports breakdown. Both `key` (slug, used as the storage value) and `label`
// (display text) are exported so server validation and UI rendering agree.
// Both institutions draw from this one catalogue and each uses the subset
// that fits how it actually bills. A school collects three terms, a kit and
// a uniform; a college collects two semesters plus hostel, lab and exam
// fees. Keeping one list means a receipt, a reminder and the Reports
// breakdown all resolve a stored key to the same words no matter which
// institution raised the fee.
export const FEE_TYPES = [
  // 'annual' is the bucket the bulk Excel import drops every student's
  // per-row Fees amount into — institutions that quote a single yearly
  // figure (rather than splitting it) live here.
  { key: "annual",      label: "Annual Fees" },
  { key: "application", label: "Admission Fees" },
  { key: "tuition",     label: "Tuition Fees" },

  // School heads
  { key: "term1",       label: "Term I" },
  { key: "term2",       label: "Term II" },
  { key: "term3",       label: "Term III" },
  { key: "kit",         label: "Kit Fees" },
  { key: "uniform",     label: "Uniform" },
  { key: "eca",         label: "ECA" },
  { key: "stem",        label: "STEM Fees" },
  { key: "annualday",   label: "Annual Day" },

  // College heads
  { key: "semester1",   label: "Semester I Fees" },
  { key: "semester2",   label: "Semester II Fees" },
  { key: "hostel",      label: "Hostel Fees" },
  { key: "lab",         label: "Laboratory Fees" },
  { key: "exam",        label: "Examination Fees" },
  { key: "library",     label: "Library Fees" },

  // Charged by both
  { key: "transport",   label: "Transport" },
];

const FEE_TYPE_BY_KEY = Object.fromEntries(FEE_TYPES.map((t) => [t.key, t]));

// Resolve a stored key to its display label. Unknown keys (or older records
// with no key at all) fall back to "Term I" — the most common bucket.
export function feeTypeLabel(key) {
  return FEE_TYPE_BY_KEY[key]?.label || FEE_TYPE_BY_KEY.term1.label;
}

// Validate + slug an arbitrary input down to a known FEE_TYPES key. Returns
// the canonical key, or "term1" if the input doesn't match anything.
export function normalizeFeeType(raw) {
  const k = String(raw || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return FEE_TYPE_BY_KEY[k] ? k : "term1";
}

// ---------------------------------------------------------------------------
// Guardian contact
//
// `parentPhone` is the real column. Before it existed the number was typed
// into the free-form `parent` name ("Mr Suresh - 9876543210") and every
// sender dug it out with its own regex; this keeps that fallback in one
// place so older rows still reach a parent, and new rows do not depend on
// anyone formatting a name correctly.
// ---------------------------------------------------------------------------

/** Ten-digit Indian mobile for a student's guardian, or null. */
export function guardianPhone(student) {
  if (!student) return null;
  const direct = String(student.parentPhone ?? student.parent_phone ?? "").replace(/\D/g, "");
  const scraped = String(student.parent ?? "").replace(/\D/g, "");
  for (const candidate of [direct, scraped]) {
    const ten = candidate.slice(-10);
    if (ten.length === 10 && /^[6-9]/.test(ten)) return ten;
  }
  return null;
}

/** The guardian's name with any trailing phone number stripped off. */
export function guardianName(student) {
  const raw = String(student?.parent ?? "").trim();
  if (!raw) return "";
  return raw.replace(/[\s·,-]*\+?\d[\d\s-]{8,}$/, "").trim() || raw;
}

/** "Dear Father" / "Dear Guardian" — how a message should open. */
export function guardianSalutation(student) {
  const rel = String(student?.parentRelation ?? student?.parent_relation ?? "").trim();
  return rel || "Parent";
}

// ---------------------------------------------------------------------------
// Who counts as teaching staff
//
// The job title differs by institution: a school has Teachers, Senior
// Teachers and a Headmistress; a college has Assistant Professors, an
// Associate Professor and a Professor & Head. A /teach/i test covers the
// first list and none of the second, which left the college's staff
// attendance card dividing by zero.
//
// Matching on titles rather than departments because a Lab Assistant sits
// in the Science department without teaching, and a Physical Education
// teacher teaches without sitting in an academic one.
// ---------------------------------------------------------------------------
const TEACHING_TITLE = /(teacher|professor|faculty|lecturer|tutor|headmistress|headmaster|principal|coordinator|dean)/i;
// Titles that read as academic but describe support work. "Lab Assistant"
// and "Lab Instructor" keep the labs running rather than taking classes.
const NON_TEACHING_TITLE = /(assistant|attender|driver|technician|warden|clerk|nurse|superintendent|librarian|instructor)/i;

/** True when this staff role is a teaching one, in either institution. */
export function isTeachingRole(role) {
  const r = String(role || "");
  if (!r) return false;
  if (NON_TEACHING_TITLE.test(r) && !/professor|teacher/i.test(r)) return false;
  return TEACHING_TITLE.test(r);
}

// Class-label rendering. The on-disk shape stays "N-X" (e.g. "5-A", "13-A")
// because dozens of screens parse via cls.split("-"). The school in
// production only runs one stream per grade (no Section A / Section B),
// so we render display labels WITHOUT the section letter. The "-A"
// becomes invisible plumbing — preserved in storage so the data model
// can grow back into sections if a future school needs them.
//
// Roman numerals (I–XII) for primary, named buckets for pre-school
// (PRE-MONT / MONT I / MONT II). These are exposed both server-side
// (audit log entries, receipt particulars) and client-side (chips,
// dropdowns, KPI sub-lines).

const ROMAN_NUMERALS = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

// Class number → display name. 13/14/15 are the reserved positive
// integers for pre-school (kept in sync with parseClassValue in
// app/api/students/import/route.js).
export function classNameFromNumber(n) {
  const num = Number(n);
  if (num === 13) return "PRE-MONT";
  if (num === 14) return "MONT I";
  if (num === 15) return "MONT II";
  if (num >= 1 && num <= 12) return ROMAN_NUMERALS[num];
  return String(num || "");
}

// Display label for a full class key ("5-A", "13-A") — drops the
// section letter from the rendered string. Falls back gracefully on
// malformed input. Examples:
//   "5-A"  → "Class V"
//   "13-A" → "PRE-MONT"
//   "14"   → "MONT I"
export function formatClassLabel(cls, type) {
  if (!cls && cls !== 0) return "—";
  const [head] = String(cls).split("-");
  const n = Number(head);
  if (!n || Number.isNaN(n)) return String(cls);
  // College mode reads the same numeric key as a semester, in plain digits —
  // "Semester 3", never "Semester III". The stored value is untouched, so a
  // deployment can be flipped between modes without migrating a single row.
  if (isCollege(type)) return `${vocab(type).classWord} ${n}`;
  const name = classNameFromNumber(n);
  if (n >= 13) return name; // pre-school labels already self-contained
  return `Class ${name}`;
}

/** Class label including the section, e.g. "Class V · A" / "Semester 3 · A". */
export function formatClassSectionLabel(cls, type) {
  if (!cls && cls !== 0) return "—";
  const parts = String(cls).split("-");
  const base = formatClassLabel(cls, type);
  const section = parts[1];
  return section ? `${base} · ${section}` : base;
}

// Holidays / sudden leave — stored as academic.holidays JSON:
// [{ date: "YYYY-MM-DD", reason: "..." }, ...]
export function parseHolidays(settings) {
  const raw = settings?.academic?.holidays;
  if (!raw) return [];
  let list = raw;
  if (typeof raw === "string") {
    try { list = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const h of list) {
    const date = String(h?.date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || seen.has(date)) continue;
    seen.add(date);
    out.push({ date, reason: String(h?.reason || "").trim() });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

export function getHolidayDates(settings) {
  return parseHolidays(settings).map((h) => h.date);
}

// Base planned working days for a class (before holiday subtraction).
export function getBaseWorkingDays(settings, cls) {
  const academic = settings?.academic || {};
  const head = cls != null && cls !== "" ? String(cls).split("-")[0] : null;
  const parse = (raw) => {
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  };
  // Empty per-class inputs must not override the school default.
  return (
    parse(head != null ? academic[`workingDays_${head}`] : null)
    ?? parse(academic.workingDays)
    ?? parse(settings?.finance?.workingDays)
  );
}

// Super Admin sets base working days per class; holidays/sudden leave
// dates subtract from that. Attendance % = present ÷ effective working days.
// If base unset, fall back to present ÷ logged school days.
export function getWorkingDays(settings, cls) {
  const base = getBaseWorkingDays(settings, cls);
  if (base == null) return null;
  const holidayCount = parseHolidays(settings).length;
  return Math.max(0, base - holidayCount);
}

export function attendanceFromLogs(logs, workingDays, opts = {}) {
  const holidaySet = new Set(opts.holidayDates || []);
  const list = (Array.isArray(logs) ? logs : []).filter(
    (l) => l && (!holidaySet.size || !holidaySet.has(l.date))
  );
  const presentCount = list.filter((l) => l.attendance !== "absent").length;
  const absentCount = list.filter((l) => l.attendance === "absent").length;
  const totalLogs = list.length;
  const denom = workingDays && workingDays > 0 ? workingDays : totalLogs;
  const pct = denom > 0 ? Math.min(100, Math.round((presentCount / denom) * 100)) : null;
  return { presentCount, absentCount, totalLogs, workingDays: workingDays || null, denom, pct };
}
