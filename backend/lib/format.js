// Indian-format money helpers, used both server- and client-side.

export const money = (n) => "₹" + Number(n).toLocaleString("en-IN");

export const moneyK = (n) => {
  if (n >= 10000000) return "₹" + (n / 10000000).toFixed(2) + "Cr";
  if (n >= 100000) return "₹" + (n / 100000).toFixed(2) + "L";
  if (n >= 1000) return "₹" + (n / 1000).toFixed(1) + "K";
  return "₹" + n;
};

// Canonical list of fee categories the school collects. Order matters — it's
// the order they appear in pickers, in the receipt particulars, and in the
// Reports breakdown. Both `key` (slug, used as the storage value) and `label`
// (display text) are exported so server validation and UI rendering agree.
export const FEE_TYPES = [
  // 'annual' is the bucket the bulk Excel import drops every student's
  // per-row Fees amount into — schools that quote a single yearly tuition
  // number (rather than splitting into Term I/II/III) live here.
  { key: "annual",      label: "Annual Fees" },
  { key: "application", label: "Admission Fees" },
  { key: "kit",         label: "Kit Fees" },
  { key: "eca",         label: "ECA" },
  { key: "uniform",     label: "Uniform" },
  { key: "term1",       label: "Term I" },
  { key: "term2",       label: "Term II" },
  { key: "term3",       label: "Term III" },
  { key: "transport",   label: "Transport" },
  { key: "stem",        label: "STEM Fees" },
  { key: "annualday",   label: "Annual Day" },
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
export function formatClassLabel(cls) {
  if (!cls && cls !== 0) return "—";
  const [head] = String(cls).split("-");
  const n = Number(head);
  if (!n || Number.isNaN(n)) return String(cls);
  const name = classNameFromNumber(n);
  if (n >= 13) return name; // pre-school labels already self-contained
  return `Class ${name}`;
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
