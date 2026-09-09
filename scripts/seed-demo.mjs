// Sirah_CRM — demo seed.
//
// Populates a fresh Supabase project with a coherent, realistic institution so
// the CRM can be demonstrated end to end. Everything here is invented; there is
// no real student or parent data.
//
// Idempotent: every insert is an upsert on the primary key, so re-running
// refreshes the demo without duplicating rows.
//
//   node scripts/seed-demo.mjs
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.

import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";

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

// ------------------------------------------------------------- REST insert
async function upsert(table, rows, onConflict) {
  if (!rows.length) return;
  const qs = onConflict ? `?on_conflict=${onConflict}` : "";
  const res = await fetch(`${URL}/rest/v1/${table}${qs}`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${table}: ${res.status} ${body.slice(0, 400)}`);
  }
  console.log(`  ${table.padEnd(18)} ${String(rows.length).padStart(3)} rows`);
}

// ------------------------------------------------------------------- helpers
const TODAY = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(TODAY); d.setDate(d.getDate() - n); return d; };
const daysAhead = (n) => daysAgo(-n);
const ts = (n) => daysAgo(n).toISOString();
const pick = (a, i) => a[i % a.length];
const money = (n) => n;

// ---------------------------------------------------------------------- data
const SCHOOL = { id: "SCH-01", name: "Sirah Demo School", city: "Chennai" };

const FIRST = ["Aarav","Diya","Vihaan","Ananya","Arjun","Ishita","Kabir","Meera","Rohan","Saanvi",
               "Advait","Kavya","Nikhil","Riya","Aditya","Tara","Karthik","Nisha","Varun","Pooja",
               "Dhruv","Sneha","Rahul","Anika"];
const LAST  = ["Sharma","Iyer","Reddy","Nair","Menon","Krishnan","Patel","Rao","Gupta","Subramanian"];
const PARENT_FIRST = ["Suresh","Lakshmi","Ramesh","Priya","Vijay","Deepa","Anand","Kavitha","Mohan","Shalini"];

const CLASS_OF = (i) => (i % 8) + 1;
const SECTIONS = ["A", "B"];

// ---- students -------------------------------------------------------------
const students = FIRST.map((f, i) => {
  const last = pick(LAST, i);
  const cls = CLASS_OF(i);
  return {
    id: `STN-${9001 + i}`,
    name: `${f} ${last}`,
    cls: `${cls}${pick(SECTIONS, i)}`,
    parent: `${pick(PARENT_FIRST, i)} ${last}`,
    fee: i % 4 === 0 ? "pending" : "paid",
    attendance: 78 + ((i * 7) % 21),
    transport: i % 3 === 0 ? "RT-01" : i % 3 === 1 ? "RT-02" : "—",
    joined: iso(daysAgo(200 + i * 3)),
    status: "active",
  };
});

// ---- staff ----------------------------------------------------------------
const STAFF_DEF = [
  ["Rashmi Venkatesh", "Principal", "Administration"],
  ["Ganesh Murthy", "Academic Director", "Academics"],
  ["Latha Raman", "Teacher", "Mathematics"],
  ["Suresh Kumar", "Teacher", "Science"],
  ["Divya Prasad", "Teacher", "English"],
  ["Manoj Pillai", "Teacher", "Social Studies"],
  ["Anitha Selvam", "Teacher", "Tamil"],
  ["Ravi Shankar", "Accountant", "Finance"],
  ["Kamala Devi", "Librarian", "Library"],
  ["Prakash Nair", "Transport Manager", "Transport"],
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
  ["USR-1", "admin@sirahdemo.school",     "admin",             "Monisha Sirah",   null],
  ["USR-2", "principal@sirahdemo.school", "principal",         "Rashmi Venkatesh","STF-101"],
  ["USR-3", "director@sirahdemo.school",  "academic_director", "Ganesh Murthy",   "STF-102"],
  ["USR-4", "teacher@sirahdemo.school",   "teacher",           "Latha Raman",     "STF-103"],
  ["USR-5", "parent@sirahdemo.school",    "parent",            "Suresh Sharma",   "STN-9001"],
];

// ---- classes & subjects ---------------------------------------------------
const SUBJECT_DEF = [
  ["English", "ENG", "core"], ["Mathematics", "MAT", "core"], ["Science", "SCI", "core"],
  ["Social Studies", "SST", "core"], ["Tamil", "TAM", "language"], ["Hindi", "HIN", "language"],
  ["Computer Science", "CSC", "elective"],
];
const subjects = SUBJECT_DEF.map(([name, code, category], i) => ({
  id: `SUB-${i + 1}`, name, code, category,
}));
const classes = [1,2,3,4,5,6,7,8].map((n) => ({
  n, label: `Class ${n}`, sections: SECTIONS,
  subjects: SUBJECT_DEF.slice(0, n >= 6 ? 7 : 5).map((s) => s[0]),
}));

// ---- fees -----------------------------------------------------------------
// `due` holds an ISO date so the receivables-ageing view can bucket it.
// Spread across every ageing bucket so the demo shows a realistic spread.
const AGEING_OFFSETS = [-12, -5, 3, 9, 18, 26, 34, 41, 52, 67, 78, 96, 118, 7, 21];
const FEE_TYPES = ["term1", "term2", "term3", "transport", "kit"];
const pending_fees = AGEING_OFFSETS.map((off, i) => {
  const s = students[(i * 3) % students.length];
  return {
    id: `PF-${2001 + i}`,
    student_id: s.id,
    name: s.name,
    cls: s.cls,
    amount: money(4500 + (i % 6) * 1750),
    due: iso(off < 0 ? daysAhead(-off) : daysAgo(off)),
    overdue: off > 0,
    fee_type: pick(FEE_TYPES, i),
  };
});

const METHODS = ["UPI", "Cash", "Bank transfer", "Cheque"];
const recent_fees = Array.from({ length: 12 }, (_, i) => {
  const s = students[(i * 5 + 1) % students.length];
  const d = daysAgo(i * 2 + 1);
  return {
    id: `RF-${3001 + i}`,
    student_id: s.id,
    name: s.name,
    cls: s.cls,
    amount: money(6000 + (i % 5) * 2200),
    method: pick(METHODS, i),
    time: `${i * 2 + 1}d ago`,
    status: "paid",
    paid_at: d.toISOString(),
  };
});

// ---- admissions enquiries -------------------------------------------------
const SOURCES = ["Walk-in", "Website", "Referral", "Phone", "Social media"];
const STATUSES = ["New", "New", "Contacted", "Contacted", "Contacted", "Converted"];
const enquiries = Array.from({ length: 14 }, (_, i) => ({
  id: `ENQ-${4001 + i}`,
  name: `${pick(FIRST, i + 5)} ${pick(LAST, i + 2)}`,
  parent: `${pick(PARENT_FIRST, i + 3)} ${pick(LAST, i + 2)}`,
  phone: `+9199${String(52000000 + i * 31417).slice(0, 8)}`,
  cls: (i % 8) + 1,
  source: pick(SOURCES, i),
  date: iso(daysAgo(i * 2)),
  status: pick(STATUSES, i),
}));

// ---- exams & marks --------------------------------------------------------
const exams = [
  { id: "EXM-01", name: "Unit Test I",   type: "unit_test", cls: "5A", subject: "Mathematics", max_marks: 50, date: iso(daysAgo(28)) },
  { id: "EXM-02", name: "Unit Test I",   type: "unit_test", cls: "5A", subject: "Science",     max_marks: 50, date: iso(daysAgo(26)) },
  { id: "EXM-03", name: "Mid Term",      type: "midterm",   cls: "6B", subject: "English",     max_marks: 100, date: iso(daysAgo(14)) },
  { id: "EXM-04", name: "Mid Term",      type: "midterm",   cls: "7A", subject: "Mathematics", max_marks: 100, date: iso(daysAgo(12)) },
].map((e) => ({ ...e, created_by: "Latha Raman" }));

const exam_marks = [];
exams.forEach((ex, ei) => {
  students.filter((s) => s.cls === ex.cls).forEach((s, si) => {
    exam_marks.push({
      id: `EM-${ex.id}-${s.id}`,
      exam_id: ex.id,
      student_id: s.id,
      student_name: s.name,
      score: Math.round(ex.max_marks * (0.55 + ((ei * 3 + si * 7) % 40) / 100)),
      max_marks: ex.max_marks,
      recorded_by: "Latha Raman",
    });
  });
});

// ---- library --------------------------------------------------------------
const BOOK_DEF = [
  ["The Jungle Book","Rudyard Kipling","fiction"], ["Malgudi Days","R. K. Narayan","fiction"],
  ["Wings of Fire","A. P. J. Abdul Kalam","biography"], ["Panchatantra Tales","Vishnu Sharma","children"],
  ["A Brief History of Time","Stephen Hawking","science"], ["The Discovery of India","Jawaharlal Nehru","history"],
  ["Matilda","Roald Dahl","children"], ["Charlotte's Web","E. B. White","children"],
  ["The Alchemist","Paulo Coelho","fiction"], ["Elementary Mathematics","S. L. Loney","reference"],
  ["Indian Constitution: A Primer","Granville Austin","reference"], ["Train to Pakistan","Khushwant Singh","fiction"],
];
const library = BOOK_DEF.map(([title, author, category], i) => ({
  id: `BK-${5001 + i}`, title, author, category,
  isbn: `978-81-${String(1000 + i * 137).slice(0,4)}-${String(100 + i)}-${i % 10}`,
  shelf: `${String.fromCharCode(65 + (i % 4))}-${(i % 6) + 1}`,
  total_copies: 2 + (i % 4),
  added_at: ts(120 - i * 5),
}));

// ---- transport ------------------------------------------------------------
const routes = [
  { code: "RT-01", name: "Adyar — Besant Nagar", driver: "Murugan S", bus: "TN-09-AB-1234", status: "running", eta: "07:45",
    stops: [{ name: "Adyar Depot", t: "07:05" }, { name: "Indira Nagar", t: "07:18" }, { name: "Besant Nagar", t: "07:32" }, { name: "School", t: "07:45" }] },
  { code: "RT-02", name: "Velachery — Guindy", driver: "Ashok Kumar", bus: "TN-09-CD-5678", status: "running", eta: "07:50",
    stops: [{ name: "Velachery Bypass", t: "07:00" }, { name: "Guindy Metro", t: "07:20" }, { name: "Saidapet", t: "07:35" }, { name: "School", t: "07:50" }] },
  { code: "RT-03", name: "T. Nagar — Kodambakkam", driver: "Rajesh V", bus: "TN-09-EF-9012", status: "idle", eta: "07:55",
    stops: [{ name: "T. Nagar Bus Stand", t: "07:10" }, { name: "Kodambakkam", t: "07:28" }, { name: "School", t: "07:55" }] },
];

// ---- complaints -----------------------------------------------------------
const COMPLAINT_DEF = [
  ["Bus arriving late on RT-02", "transport", "open"],
  ["Request for extra Maths worksheets", "academic", "in_progress"],
  ["Classroom fan not working — 6B", "non_academic", "open"],
  ["Library book reissue request", "non_academic", "resolved"],
  ["Clarification on Term II fee", "non_academic", "resolved"],
];
const complaints = COMPLAINT_DEF.map(([issue, category, status], i) => {
  const s = students[(i * 4) % students.length];
  return {
    id: `CMP-${6001 + i}`,
    student: s.name, student_id: s.id, cls: s.cls, parent: s.parent,
    issue, type: "general", category,
    date: iso(daysAgo(i * 3 + 1)),
    status, assigned: pick(["Rashmi Venkatesh", "Ganesh Murthy", "Prakash Nair"], i),
    submitted_by: "parent",
  };
});

// ---- activity feed --------------------------------------------------------
const ACT_DEF = [
  ["fee","ok","Fee collected","₹8,200 from Aarav Sharma (UPI)"],
  ["admission","ok","Enquiry converted","Kabir Patel admitted to Class 3"],
  ["complaint","warn","New complaint","Bus arriving late on RT-02"],
  ["exam","ok","Marks published","Mid Term · English · 6B"],
  ["staff","ok","Staff added","Kamala Devi joined as Librarian"],
  ["transport","warn","Route delayed","RT-02 running 12 min late"],
  ["library","ok","Book issued","Wings of Fire → Diya Iyer"],
  ["fee","warn","Fee overdue","5 students crossed 60 days"],
];
const activities = ACT_DEF.map(([t, tone, title, sub], i) => ({
  id: `ACT-${7001 + i}`, t, tone, title, sub, ts: ts(i),
}));

// ---- timetable ------------------------------------------------------------
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const timetable = [];
["5A", "6B", "7A"].forEach((cls) => {
  DAYS.forEach((day, di) => {
    for (let p = 1; p <= 6; p++) {
      const sub = SUBJECT_DEF[(di + p) % 5][0];
      timetable.push({
        id: `TT-${cls}-${day}-${p}`,
        cls, day, period: p, subject: sub,
        teacher_name: pick(["Latha Raman","Suresh Kumar","Divya Prasad","Manoj Pillai","Anitha Selvam"], di + p),
        room: `R-${100 + (p % 8)}`,
      });
    }
  });
});

// ---- settings -------------------------------------------------------------
const app_settings = [
  { section: "school",  key: "name",    value: JSON.stringify("Sirah Demo School") },
  { section: "school",  key: "city",    value: JSON.stringify("Chennai, Tamil Nadu") },
  { section: "school",  key: "address", value: JSON.stringify("12 Anna Salai, Chennai 600002") },
  { section: "school",  key: "phone",   value: JSON.stringify("+91 44 4000 1234") },
  { section: "finance", key: "upi",     value: JSON.stringify("sirahdemo@hdfc") },
];

// ------------------------------------------------------------------- run it
async function main() {
  console.log(`Seeding Sirah_CRM demo data -> ${URL}\n`);

  const password_hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users = USER_DEF.map(([id, email, role, name, linked_id]) => ({
    id, email, role, name, linked_id, password_hash,
  }));

  await upsert("schools", [{ ...SCHOOL, status: "Active", students: students.length,
                             fees: recent_fees.reduce((a, r) => a + r.amount, 0), puck: "ink" }], "id");
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

  console.log(`\nDone.\n`);
  console.log(`Sign in at /login with any of:`);
  for (const [, email, role] of USER_DEF) {
    console.log(`  ${email.padEnd(30)} ${DEMO_PASSWORD}   (${role})`);
  }
}

main().catch((e) => { console.error("\nSEED FAILED:", e.message); process.exit(1); });
