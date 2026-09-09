// Institution mode — school vs college.
//
// Sirah_CRM ships one codebase that presents as either a school or a college.
// The data model is deliberately unchanged between the two: a "class" row and
// a "semester" row are the same record, and `cls` keys stay numeric ("3-A") in
// both modes. Only the vocabulary and the academic framing differ, which keeps
// every existing query, screen and write path working in both modes.
//
// The mode lives in app_settings under school.institutionType and is read once
// per session. A deployment is one institution, so a module-level current mode
// is correct here — there is no per-request variance to guard against.

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

let CURRENT = "school";

export function setInstitutionType(t) {
  CURRENT = INSTITUTION_TYPES.includes(t) ? t : "school";
  return CURRENT;
}

export function getInstitutionType() {
  return CURRENT;
}

/** Resolve the mode out of a settings object, falling back to school. */
export function institutionTypeFromSettings(settings) {
  let raw = settings?.school?.institutionType ?? settings?.school?.institution_type;
  if (typeof raw !== "string") return "school";
  raw = raw.trim();
  // Tolerate a value that was written JSON-encoded ('"college"') by an older
  // seed — settings are otherwise stored raw, and a stray pair of quotes
  // would silently pin the whole app back to school mode.
  if (raw.length > 1 && raw[0] === '"' && raw[raw.length - 1] === '"') {
    raw = raw.slice(1, -1);
  }
  return INSTITUTION_TYPES.includes(raw) ? raw : "school";
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
