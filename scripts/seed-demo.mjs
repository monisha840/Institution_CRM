// Sirah_CRM — demo seed, school or college.
//
// Populates a fresh Supabase project with a coherent, realistic institution so
// the CRM can be demonstrated end to end. Everything here is invented; there
// is no real student or guardian data.
//
//   node scripts/seed-demo.mjs             → school demo  (Class I-VIII)
//   node scripts/seed-demo.mjs --college   → college demo (Semesters 1-6, GPA)
//
// Both modes write the same tables in the same shapes — the data model does
// not change between them, only the academic framing. The seed also sets
// school.institutionType, so running it leaves the app already in the matching
// mode; Settings → Institution can still flip the vocabulary live.
//
// Idempotent: every insert is an upsert on the primary key. Exams and marks are
// cleared first, because the two modes describe different assessments and a mix
// of "Mid Term · English" and "Internal Assessment · DBMS" would read as a bug.
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.

import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";

const COLLEGE = process.argv.includes("--college");
const MODE = COLLEGE ? "college" : "school";

// ---------------------------------------------------------------- env loading
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

// ------------------------------------------------------------- REST helpers
async function upsert(table, rows, onConflict) {
  if (!rows.length) return;
  const qs = onConflict ? `?on_conflict=${onConflict}` : "";
  let payload = rows;
  const dropped = [];

  // Strip whichever column the target database doesn't have and retry, the
  // same way the app's own writes do. Lets the seed run against a project that
  // hasn't had supabase-fix-01.sql applied yet (subjects.credits being the
  // usual one) instead of failing outright.
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch(`${URL}/rest/v1/${table}${qs}`, {
      method: "POST",
      headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const note = dropped.length ? `  (skipped: ${dropped.join(", ")})` : "";
      console.log(`  ${table.padEnd(18)} ${String(payload.length).padStart(3)} rows${note}`);
      return;
    }
    const body = await res.text();
    const m = /Could not find the '([a-z_]+)' column/i.exec(body);
    if (!m) throw new Error(`${table}: ${res.status} ${body.slice(0, 400)}`);
    dropped.push(m[1]);
    payload = payload.map((r) => { const n = { ...r }; delete n[m[1]]; return n; });
  }
  throw new Error(`${table}: too many unknown columns`);
}

async function wipe(table, filter) {
  const res = await fetch(`${URL}/rest/v1/${table}?${filter}`, { method: "DELETE", headers: H });
  if (!res.ok) throw new Error(`${table} delete: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

// ------------------------------------------------------------------- helpers
const TODAY = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(TODAY); d.setDate(d.getDate() - n); return d; };
const daysAhead = (n) => daysAgo(-n);
const ts = (n) => daysAgo(n).toISOString();
const pick = (a, i) => a[i % a.length];

// ---------------------------------------------------------------------- data
const INSTITUTION = COLLEGE
  ? { id: "SCH-01", name: "Sirah Demo College", city: "Chennai", programme: "B.Sc Computer Science" }
  : { id: "SCH-01", name: "Sirah Demo School",  city: "Chennai", programme: "CBSE" };

const FIRST = ["Aarav","Diya","Vihaan","Ananya","Arjun","Ishita","Kabir","Meera","Rohan","Saanvi",
               "Advait","Kavya","Nikhil","Riya","Aditya","Tara","Karthik","Nisha","Varun","Pooja",
               "Dhruv","Sneha","Rahul","Anika"];
const LAST  = ["Sharma","Iyer","Reddy","Nair","Menon","Krishnan","Patel","Rao","Gupta","Subramanian"];
const GUARDIAN_FIRST = ["Suresh","Lakshmi","Ramesh","Priya","Vijay","Deepa","Anand","Kavitha","Mohan","Shalini"];

// School runs Class 1-8; college runs Semester 1-6. Same numeric `cls` key in
// both — only the rendered label differs.
const LEVELS = COLLEGE ? 6 : 8;
const SECTIONS = ["A", "B"];

// ---- students -------------------------------------------------------------
const students = FIRST.map((f, i) => {
  const last = pick(LAST, i);
  return {
    id: `STN-${9001 + i}`,
    name: `${f} ${last}`,
    cls: `${(i % LEVELS) + 1}-${pick(SECTIONS, i)}`,
    parent: `${pick(GUARDIAN_FIRST, i)} ${last}`,
    fee: i % 4 === 0 ? "pending" : "paid",
    attendance: 78 + ((i * 7) % 21),
    transport: i % 3 === 0 ? "RT-01" : i % 3 === 1 ? "RT-02" : "—",
    joined: iso(daysAgo(200 + i * 3)),
    status: "active",
  };
});

// ---- staff / faculty ------------------------------------------------------
const STAFF_DEF = COLLEGE ? [
  ["Rashmi Venkatesh", "Principal",           "Administration"],
  ["Ganesh Murthy",    "Head of Department",  "Computer Science"],
  ["Latha Raman",      "Associate Professor", "Computer Science"],
  ["Suresh Kumar",     "Assistant Professor", "Computer Science"],
  ["Divya Prasad",     "Assistant Professor", "Mathematics"],
  ["Manoj Pillai",     "Assistant Professor", "Electronics"],
  ["Anitha Selvam",    "Lab Instructor",      "Computer Science"],
  ["Ravi Shankar",     "Accountant",          "Finance"],
  ["Kamala Devi",      "Librarian",           "Library"],
  ["Prakash Nair",     "Transport Manager",   "Transport"],
] : [
  ["Rashmi Venkatesh", "Principal",         "Administration"],
  ["Ganesh Murthy",    "Academic Director", "Academics"],
  ["Latha Raman",      "Teacher",           "Mathematics"],
  ["Suresh Kumar",     "Teacher",           "Science"],
  ["Divya Prasad",     "Teacher",           "English"],
  ["Manoj Pillai",     "Teacher",           "Social Studies"],
  ["Anitha Selvam",    "Teacher",           "Tamil"],
  ["Ravi Shankar",     "Accountant",        "Finance"],
  ["Kamala Devi",      "Librarian",         "Library"],
  ["Prakash Nair",     "Transport Manager", "Transport"],
];
const staff = STAFF_DEF.map(([name, role, dept], i) => ({
  id: `STF-${101 + i}`,
  name, role, dept,
  phone: `+9198${String(40000000 + i * 13571).slice(0, 8)}`,
  email: `${name.split(" ")[0].toLowerCase()}@sirahdemo.school`,
  joining_date: iso(daysAgo(400 + i * 30)),
  salary: 28000 + i * 2500,
  attendance: 88 + (i % 11),
  tasks: i % 5,
  score: 70 + (i % 26),
  status: "ok",
}));

// ---- login users ----------------------------------------------------------
const DEMO_PASSWORD = "Sirah@2026";
const USER_DEF = [
  ["USR-1", "admin@sirahdemo.school",     "admin",             "Monisha Sirah",    null],
  ["USR-2", "principal@sirahdemo.school", "principal",         "Rashmi Venkatesh", "STF-101"],
  ["USR-3", "director@sirahdemo.school",  "academic_director", "Ganesh Murthy",    "STF-102"],
  ["USR-4", "teacher@sirahdemo.school",   "teacher",           "Latha Raman",      "STF-103"],
  ["USR-5", "parent@sirahdemo.school",    "parent",            "Suresh Sharma",    "STN-9001"],
];

// ---- subjects -------------------------------------------------------------
// College papers carry real credit weights, which is what makes the GPA on the
// Exams screen credit-weighted rather than a flat mean.
const SUBJECT_DEF = COLLEGE ? [
  ["SUB-CS-DS",  "Data Structures",        4],
  ["SUB-CS-DB",  "Database Systems",       4],
  ["SUB-CS-OS",  "Operating Systems",      4],
  ["SUB-CS-CN",  "Computer Networks",      3],
  ["SUB-CS-SE",  "Software Engineering",   3],
  ["SUB-CS-MA",  "Discrete Mathematics",   4],
  ["SUB-CS-LAB", "Programming Laboratory", 2],
] : [
  ["SUB-ENG", "English",        4],
  ["SUB-MAT", "Maths",          4],
  ["SUB-SCI", "Science",        4],
  ["SUB-SST", "Social Science", 3],
  ["SUB-TAM", "Tamil",          3],
  ["SUB-HIN", "Hindi",          3],
  ["SUB-PT",  "PT",             1],
];
const subjects = SUBJECT_DEF.map(([id, name, credits]) => ({
  id, name, credits, category: credits >= 4 ? "core" : "elective",
}));
const SUBJECT_NAMES = SUBJECT_DEF.map((s) => s[1]);

const classes = Array.from({ length: LEVELS }, (_, i) => ({
  n: i + 1,
  label: COLLEGE ? `Semester ${i + 1}` : `Class ${i + 1}`,
  sections: SECTIONS,
  subjects: SUBJECT_NAMES.slice(0, 5),
}));

// ---- fees -----------------------------------------------------------------
// `due` holds an ISO date so the receivables-ageing strip can bucket it; the
// offsets deliberately populate every bucket from "not due" through "90+".
const AGEING_OFFSETS = [-12, -5, 3, 9, 18, 26, 34, 41, 52, 67, 78, 96, 118, 7, 21];
const FEE_TYPES = ["term1", "term2", "term3", "transport", "kit"];
const pending_fees = AGEING_OFFSETS.map((off, i) => {
  const s = students[(i * 3) % students.length];
  return {
    id: `PF-${2001 + i}`,
    student_id: s.id,
    name: s.name,
    cls: s.cls,
    amount: (COLLEGE ? 12000 : 4500) + (i % 6) * (COLLEGE ? 3500 : 1750),
    due: iso(off < 0 ? daysAhead(-off) : daysAgo(off)),
    overdue: off > 0,
    fee_type: pick(FEE_TYPES, i),
  };
});

const METHODS = ["UPI", "Cash", "Bank transfer", "Cheque"];
const recent_fees = Array.from({ length: 12 }, (_, i) => {
  const s = students[(i * 5 + 1) % students.length];
  return {
    id: `RF-${3001 + i}`,
    student_id: s.id,
    name: s.name,
    cls: s.cls,
    amount: (COLLEGE ? 18000 : 6000) + (i % 5) * (COLLEGE ? 4400 : 2200),
    method: pick(METHODS, i),
    time: `${i * 2 + 1}d ago`,
    status: "paid",
    paid_at: daysAgo(i * 2 + 1).toISOString(),
  };
});

// ---- admissions enquiries -------------------------------------------------
const SOURCES = COLLEGE
  ? ["Walk-in", "Website", "Referral", "Counselling", "Education fair"]
  : ["Walk-in", "Website", "Referral", "Phone", "Social media"];
const STATUSES = ["New", "New", "Contacted", "Contacted", "Contacted", "Converted"];
const enquiries = Array.from({ length: 14 }, (_, i) => ({
  id: `ENQ-${4001 + i}`,
  name: `${pick(FIRST, i + 5)} ${pick(LAST, i + 2)}`,
  parent: `${pick(GUARDIAN_FIRST, i + 3)} ${pick(LAST, i + 2)}`,
  phone: `+9199${String(52000000 + i * 31417).slice(0, 8)}`,
  cls: (i % LEVELS) + 1,
  source: pick(SOURCES, i),
  date: iso(daysAgo(i * 2)),
  status: pick(STATUSES, i),
}));

// ---- exams & marks --------------------------------------------------------
// College runs two internals plus an end-semester paper per subject, which is
// what makes a credit-weighted GPA meaningful.
const EXAM_PLAN = COLLEGE
  ? [
      ["Internal Assessment I",  "unit_test", 25, 30],
      ["Internal Assessment II", "unit_test", 25, 16],
      ["End Semester",           "final",     75,  6],
    ]
  : [
      ["Unit Test I", "unit_test", 50, 28],
      ["Mid Term",    "midterm",  100, 13],
    ];
const EXAM_CLASSES = COLLEGE ? ["3-A", "5-A"] : ["5-A", "6-B", "7-A"];
const EXAM_SUBJECTS = SUBJECT_NAMES.slice(0, COLLEGE ? 4 : 3);

const exams = [];
let examSeq = 1;
for (const cls of EXAM_CLASSES) {
  for (const subject of EXAM_SUBJECTS) {
    for (const [name, type, max, ago] of EXAM_PLAN) {
      exams.push({
        id: `EXM-${String(examSeq++).padStart(3, "0")}`,
        name, type, cls, subject,
        max_marks: max,
        date: iso(daysAgo(ago)),
        created_by: staff[2].name,
      });
    }
  }
}

const exam_marks = [];
exams.forEach((ex, ei) => {
  students.filter((s) => s.cls === ex.cls).forEach((s, si) => {
    // Deterministic 55-95% spread so the GPA table shows a real distribution
    // (and a believable topper) rather than a flat line.
    const pct = 0.55 + ((ei * 7 + si * 13) % 41) / 100;
    exam_marks.push({
      id: `EM-${ex.id}-${s.id}`,
      exam_id: ex.id,
      student_id: s.id,
      student_name: s.name,
      score: Math.round(ex.max_marks * pct),
      max_marks: ex.max_marks,
      recorded_by: staff[2].name,
    });
  });
});

// ---- library --------------------------------------------------------------
const BOOK_DEF = COLLEGE ? [
  ["Introduction to Algorithms","Cormen & Leiserson","reference"],
  ["Database System Concepts","Silberschatz & Korth","reference"],
  ["Operating System Concepts","Silberschatz & Galvin","reference"],
  ["Computer Networks","Andrew S. Tanenbaum","reference"],
  ["Clean Code","Robert C. Martin","reference"],
  ["The Pragmatic Programmer","Hunt & Thomas","reference"],
  ["Discrete Mathematics and Its Applications","Kenneth Rosen","reference"],
  ["Artificial Intelligence: A Modern Approach","Russell & Norvig","reference"],
  ["Compilers: Principles and Techniques","Aho & Ullman","reference"],
  ["Wings of Fire","A. P. J. Abdul Kalam","biography"],
  ["The Discovery of India","Jawaharlal Nehru","history"],
  ["A Brief History of Time","Stephen Hawking","science"],
] : [
  ["The Jungle Book","Rudyard Kipling","fiction"], ["Malgudi Days","R. K. Narayan","fiction"],
  ["Wings of Fire","A. P. J. Abdul Kalam","biography"], ["Panchatantra Tales","Vishnu Sharma","children"],
  ["A Brief History of Time","Stephen Hawking","science"], ["The Discovery of India","Jawaharlal Nehru","history"],
  ["Matilda","Roald Dahl","children"], ["Charlotte's Web","E. B. White","children"],
  ["The Alchemist","Paulo Coelho","fiction"], ["Elementary Mathematics","S. L. Loney","reference"],
  ["Indian Constitution: A Primer","Granville Austin","reference"], ["Train to Pakistan","Khushwant Singh","fiction"],
];
const library = BOOK_DEF.map(([title, author, category], i) => ({
  id: `BK-${5001 + i}`, title, author, category,
  isbn: `978-81-${String(1000 + i * 137).slice(0, 4)}-${String(100 + i)}-${i % 10}`,
  shelf: `${String.fromCharCode(65 + (i % 4))}-${(i % 6) + 1}`,
  total_copies: 2 + (i % 4),
  added_at: ts(120 - i * 5),
}));

// ---- transport ------------------------------------------------------------
const STOP_END = COLLEGE ? "College" : "School";
const routes = [
  { code: "RT-01", name: "Adyar — Besant Nagar", driver: "Murugan S", bus: "TN-09-AB-1234", status: "running", eta: "07:45",
    stops: [{ name: "Adyar Depot", t: "07:05" }, { name: "Indira Nagar", t: "07:18" }, { name: "Besant Nagar", t: "07:32" }, { name: STOP_END, t: "07:45" }] },
  { code: "RT-02", name: "Velachery — Guindy", driver: "Ashok Kumar", bus: "TN-09-CD-5678", status: "running", eta: "07:50",
    stops: [{ name: "Velachery Bypass", t: "07:00" }, { name: "Guindy Metro", t: "07:20" }, { name: "Saidapet", t: "07:35" }, { name: STOP_END, t: "07:50" }] },
  { code: "RT-03", name: "T. Nagar — Kodambakkam", driver: "Rajesh V", bus: "TN-09-EF-9012", status: "idle", eta: "07:55",
    stops: [{ name: "T. Nagar Bus Stand", t: "07:10" }, { name: "Kodambakkam", t: "07:28" }, { name: STOP_END, t: "07:55" }] },
];

// ---- complaints -----------------------------------------------------------
const COMPLAINT_DEF = COLLEGE ? [
  ["Bus arriving late on RT-02", "Open"],
  ["Request for extra lab hours", "In Progress"],
  ["Projector not working - Lab 2", "Open"],
  ["Library book reissue request", "Resolved"],
  ["Clarification on semester fee", "Resolved"],
] : [
  ["Bus arriving late on RT-02", "Open"],
  ["Request for extra Maths worksheets", "In Progress"],
  ["Classroom fan not working - 6B", "Open"],
  ["Library book reissue request", "Resolved"],
  ["Clarification on Term II fee", "Resolved"],
];
const complaints = COMPLAINT_DEF.map(([issue, status], i) => {
  const s = students[(i * 4) % students.length];
  return {
    id: `CMP-${6001 + i}`,
    student: s.name, student_id: s.id, cls: s.cls, parent: s.parent,
    issue, type: "general",
    date: iso(daysAgo(i * 3 + 1)),
    status, assigned: pick([staff[0].name, staff[1].name, staff[9].name], i),
    submitted_by: "parent",
  };
});

// ---- activity feed --------------------------------------------------------
const ACT_DEF = COLLEGE ? [
  ["fee","ok","Fee collected","Rs 22,400 from Aarav Sharma (UPI)"],
  ["admission","ok","Enquiry converted","Kabir Patel admitted to Semester 1"],
  ["complaint","warn","New complaint","Bus arriving late on RT-02"],
  ["exam","ok","Marks published","Internal Assessment II - Database Systems"],
  ["staff","ok","Faculty added","Kamala Devi joined as Librarian"],
  ["transport","warn","Route delayed","RT-02 running 12 min late"],
  ["library","ok","Book issued","Introduction to Algorithms - Diya Iyer"],
  ["fee","warn","Fee overdue","5 students crossed 60 days"],
] : [
  ["fee","ok","Fee collected","Rs 8,200 from Aarav Sharma (UPI)"],
  ["admission","ok","Enquiry converted","Kabir Patel admitted to Class 3"],
  ["complaint","warn","New complaint","Bus arriving late on RT-02"],
  ["exam","ok","Marks published","Mid Term - English - 6B"],
  ["staff","ok","Staff added","Kamala Devi joined as Librarian"],
  ["transport","warn","Route delayed","RT-02 running 12 min late"],
  ["library","ok","Book issued","Wings of Fire - Diya Iyer"],
  ["fee","warn","Fee overdue","5 students crossed 60 days"],
];
const activities = ACT_DEF.map(([t, tone, title, sub], i) => ({
  id: 7001 + i, t, tone, title, sub, ts: ts(i),
}));

// ---- timetable ------------------------------------------------------------
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const timetable = [];
for (const cls of EXAM_CLASSES) {
  DAYS.forEach((day, di) => {
    for (let p = 1; p <= 6; p++) {
      timetable.push({
        id: `TT-${cls}-${day}-${p}`,
        cls, day, period: p,
        subject: pick(SUBJECT_NAMES, di + p),
        teacher_name: pick(staff.slice(2, 7).map((s) => s.name), di + p),
        room: COLLEGE ? `Lab-${100 + (p % 4)}` : `R-${100 + (p % 8)}`,
      });
    }
  });
}

// ---- settings -------------------------------------------------------------
// writeSettings() persists scalars raw and only JSON-encodes objects/arrays,
// and readSettings() hands the stored value straight back. Storing a
// JSON.stringify'd string here would surface as a quoted "college" everywhere,
// including the institution-mode check.
const app_settings = [
  { section: "school",  key: "institutionType", value: MODE },
  { section: "school",  key: "name",            value: INSTITUTION.name },
  { section: "school",  key: "city",            value: `${INSTITUTION.city}, Tamil Nadu` },
  { section: "school",  key: "programme",       value: INSTITUTION.programme },
  { section: "school",  key: "address",         value: "12 Anna Salai, Chennai 600002" },
  { section: "school",  key: "phone",           value: "+91 44 4000 1234" },
  { section: "finance", key: "upi",             value: "sirahdemo@hdfc" },
  { section: "finance", key: "academicYear",    value: "2026-27" },
];

// ------------------------------------------------------------------- run it
async function main() {
  console.log(`Seeding Sirah_CRM ${MODE.toUpperCase()} demo -> ${URL}\n`);

  const password_hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users = USER_DEF.map(([id, email, role, name, linked_id]) => ({
    id, email, role, name, linked_id, password_hash,
  }));

  // The two modes describe different assessments, so clear the previous set
  // rather than letting school and college exams sit side by side.
  console.log("  clearing previous exams + marks");
  await wipe("exam_marks", "id=like.EM-*");
  await wipe("exams", "id=like.EXM-*");

  await upsert("schools", [{
    id: INSTITUTION.id, name: INSTITUTION.name, city: INSTITUTION.city, status: "Active",
    students: students.length,
    fees: recent_fees.reduce((a, r) => a + r.amount, 0),
    puck: "ink",
  }], "id");
  await upsert("users", users, "id");
  await upsert("subjects", subjects, "id");
  await upsert("classes", classes, "n");
  await upsert("students", students, "id");
  await upsert("staff", staff, "id");
  await upsert("pending_fees", pending_fees, "id");
  await upsert("recent_fees", recent_fees, "id");
  await upsert("enquiries", enquiries, "id");
  await upsert("exams", exams, "id");
  await upsert("exam_marks", exam_marks, "id");
  await upsert("library", library, "id");
  await upsert("routes", routes, "code");
  await upsert("complaints", complaints, "id");
  await upsert("activities", activities, "id");
  await upsert("timetable", timetable, "id");
  await upsert("app_settings", app_settings, "section,key");

  console.log(`\nDone — ${INSTITUTION.name} (${MODE} mode).\n`);
  console.log("Sign in at /login with any of:");
  for (const [, email, role] of USER_DEF) {
    console.log(`  ${email.padEnd(30)} ${DEMO_PASSWORD}   (${role})`);
  }
  if (COLLEGE) {
    console.log(`\n  Exams → "Grade point average" shows credit-weighted GPA for ${EXAM_CLASSES.join(" and ")}.`);
  }
  console.log(`\n  Switch mode any time: Settings → Institution → Institution type.`);
}

main().catch((e) => { console.error("\nSEED FAILED:", e.message); process.exit(1); });
