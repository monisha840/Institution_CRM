// Institution mode — school vs college.
//
// Sirah CRM serves two institutions from one codebase and one database. The
// mode is a property of the *tenant* (see lib/tenants.js), not a setting that
// gets toggled at runtime: the school tenant is always a school and the
// college tenant is always a college. Each has its own students, classes,
// subjects, staff and fee structure; nothing is shared.
//
// What this module owns is the vocabulary and the academic rules that differ
// between the two — Class vs Semester, Parent vs Guardian, marks vs
// credit-weighted GPA. It is deliberately pure so that client components can
// import it: no next/headers, no async_hooks, no database.
//
// Resolving the mode:
//
//   Server — derive it from the request's tenant. `institutionTypeFor()`
//            takes a tenant id, and every server helper that needs the
//            vocabulary accepts an explicit `type`. Nothing reads module
//            state, because one Node process serves both institutions
//            concurrently and a module-level "current mode" would let one
//            request's tenant bleed into another's response.
//
//   Client — one browser is signed in to exactly one tenant for the life of
//            the session, so the module-level default set by AppShell via
//            setInstitutionType() is safe there and saves threading `type`
//            through several hundred call sites.

import { tenantInstitutionType } from "./tenants.js";

export const INSTITUTION_TYPES = ["school", "college"];

export const VOCAB = {
  school: {
    kind: "School",
    kindLower: "school",
    // Academic structure
    classWord: "Class",
    classPlural: "Classes",
    classShort: "Class",
    sectionWord: "Section",
    cohortWord: "Class",
    // People
    guardian: "Parent",
    guardianPlural: "Parents",
    educator: "Teacher",
    educatorPlural: "Teachers",
    classTeacher: "Class teacher",
    headTitle: "Principal",
    // Documents & cycles
    leavingCert: "Transfer certificate",
    leavingCertShort: "TC",
    termWord: "Term",
    // Class numbers render as Roman numerals ("Class V") in school mode.
    roman: true,
    gpa: false,
  },
  college: {
    kind: "College",
    kindLower: "college",
    classWord: "Semester",
    classPlural: "Semesters",
    classShort: "Sem",
    sectionWord: "Section",
    cohortWord: "Batch",
    guardian: "Guardian",
    guardianPlural: "Guardians",
    educator: "Faculty",
    educatorPlural: "Faculty",
    classTeacher: "Faculty advisor",
    headTitle: "Principal",
    leavingCert: "Migration certificate",
    leavingCertShort: "MC",
    termWord: "Semester",
    // Semesters read as plain numbers ("Semester 3"), never Roman.
    roman: false,
    gpa: true,
  },
};

/**
 * The mode a tenant presents as. This is the server-side answer — pure,
 * derived straight from the tenant registry, safe under concurrency.
 */
export function institutionTypeFor(tenantId) {
  return tenantInstitutionType(tenantId);
}

// ---------------------------------------------------------------------------
// Client-side default.
//
// CLIENT ONLY. AppShell sets this once from the signed-in session's tenant so
// that the hundreds of `vocab()` / `formatClassLabel()` calls inside screens
// don't each have to be handed a type. That is sound in a browser, where the
// module is per-page and the user is signed in to one institution.
//
// Do NOT rely on it in server code — a Node process serves both institutions
// at once, so whatever the last request happened to set is not what the
// current request means. Server callers pass an explicit `type`, sourced from
// institutionTypeFor(currentTenant()).
// ---------------------------------------------------------------------------
let CURRENT = "school";

export function setInstitutionType(t) {
  CURRENT = INSTITUTION_TYPES.includes(t) ? t : "school";
  return CURRENT;
}

export function getInstitutionType() {
  return CURRENT;
}

/**
 * Resolve the mode out of a settings object.
 *
 * Retained for the settings-driven path, but the tenant is now the
 * authority: institutionTypeFor(tenantId) is what server code should use,
 * and a tenant's mode is fixed rather than toggled. This still tolerates a
 * value that an older seed wrote JSON-encoded ('"college"'), since settings
 * are otherwise stored raw and a stray pair of quotes would silently pin the
 * whole app back to school mode.
 */
export function institutionTypeFromSettings(settings, fallback = "school") {
  let raw = settings?.school?.institutionType ?? settings?.school?.institution_type;
  if (typeof raw !== "string") return fallback;
  raw = raw.trim();
  if (raw.length > 1 && raw[0] === '"' && raw[raw.length - 1] === '"') {
    raw = raw.slice(1, -1);
  }
  return INSTITUTION_TYPES.includes(raw) ? raw : fallback;
}


// The institution's display name. CLIENT ONLY, same reasoning as CURRENT
// above — AppShell sets it once from the session's tenant so the sidebar
// brand and the page chrome can read it without prop-drilling. Server code
// should read tenantConfig(tenantId).name directly.
let CURRENT_NAME = "";

export function setInstitutionName(n) {
  CURRENT_NAME = typeof n === "string" ? n.trim() : "";
  return CURRENT_NAME;
}

export function institutionName() {
  return CURRENT_NAME || (CURRENT === "college" ? "Sirah Institute of Technology" : "Sirah Vidyalaya");
}

/** Split the name into a lead word and the remainder, for two-tone branding. */
export function institutionNameParts() {
  const full = institutionName();
  const i = full.indexOf(" ");
  return i === -1 ? { lead: full, rest: "" } : { lead: full.slice(0, i), rest: full.slice(i) };
}

/** The active vocabulary. Pass a type to override the module default. */
export function vocab(type) {
  return VOCAB[type && INSTITUTION_TYPES.includes(type) ? type : CURRENT] || VOCAB.school;
}

export function isCollege(type) {
  return (type && INSTITUTION_TYPES.includes(type) ? type : CURRENT) === "college";
}

// ---------------------------------------------------------------------------
// Grading — college mode only.
//
// Standard Indian 10-point scale. Marks come in as a percentage of the exam's
// max_marks, so this works regardless of whether a paper is out of 50 or 100.
// ---------------------------------------------------------------------------
export const GRADE_BANDS = [
  { min: 90, point: 10, letter: "O",  label: "Outstanding" },
  { min: 80, point: 9,  letter: "A+", label: "Excellent" },
  { min: 70, point: 8,  letter: "A",  label: "Very good" },
  { min: 60, point: 7,  letter: "B+", label: "Good" },
  { min: 50, point: 6,  letter: "B",  label: "Above average" },
  { min: 40, point: 5,  letter: "C",  label: "Pass" },
  { min: 0,  point: 0,  letter: "F",  label: "Fail" },
];

export function gradeFor(percent) {
  const p = Number(percent);
  if (!Number.isFinite(p)) return GRADE_BANDS[GRADE_BANDS.length - 1];
  return GRADE_BANDS.find((b) => p >= b.min) || GRADE_BANDS[GRADE_BANDS.length - 1];
}

/**
 * Credit-weighted GPA on the 10-point scale.
 *
 * `rows` are { score, maxMarks, credits }. A row with no usable max is skipped
 * rather than counted as zero, so one malformed exam can't drag a GPA down.
 * Returns null when there is nothing to average, which callers render as "—"
 * instead of a misleading 0.00.
 */
export function computeGpa(rows) {
  let points = 0;
  let credits = 0;
  for (const r of rows || []) {
    const max = Number(r?.maxMarks);
    const score = Number(r?.score);
    if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(score)) continue;
    const c = Number(r?.credits);
    const weight = Number.isFinite(c) && c > 0 ? c : 1;
    points += gradeFor((score / max) * 100).point * weight;
    credits += weight;
  }
  if (!credits) return null;
  return Math.round((points / credits) * 100) / 100;
}

/** GPA → the classification a college transcript would print. */
export function gpaClass(gpa) {
  if (gpa == null) return "—";
  if (gpa >= 9) return "First class · distinction";
  if (gpa >= 7.5) return "First class";
  if (gpa >= 6) return "Second class";
  if (gpa >= 5) return "Pass";
  return "Fail";
}
