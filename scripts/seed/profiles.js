// What makes a school a school and a college a college.
//
// The generator in build.js is shared — both institutions have students,
// staff, fees, buses and a library, and none of that logic needs to be
// written twice. What differs is everything in this file: how the academic
// year is divided, what gets taught, who teaches it, what is billed, and
// what the people are called.
//
// This is the file to edit when the demo needs a different institution.

// ---------------------------------------------------------------------------
// Sirah Vidyalaya — CBSE senior secondary, Chennai.
//
// Class I to XII, two sections each, three terms a year, marks out of 100
// with no credits. Subjects change as a child moves up: EVS in primary
// splits into Science and Social Science at middle school, and XI–XII
// specialise into a science stream.
// ---------------------------------------------------------------------------
export const SCHOOL_PROFILE = {
  tenant: "school",
  idPrefix: "SV",

  // ---- academic structure ------------------------------------------------
  // `n` is the stored class number; `cls` keys stay "n-Section" so every
  // existing screen that does cls.split("-") keeps working.
  sections: ["A", "B"],
  classes: [
    { n: 1,  stage: "primary" },
    { n: 2,  stage: "primary" },
    { n: 3,  stage: "primary" },
    { n: 4,  stage: "primary" },
    { n: 5,  stage: "primary" },
    { n: 6,  stage: "middle" },
    { n: 7,  stage: "middle" },
    { n: 8,  stage: "middle" },
    { n: 9,  stage: "secondary" },
    { n: 10, stage: "secondary" },
    { n: 11, stage: "senior" },
    { n: 12, stage: "senior" },
  ],

  subjects: [
    { id: "SV-SUB-ENG", name: "English",             code: "ENG", category: "language", stages: ["primary", "middle", "secondary", "senior"] },
    { id: "SV-SUB-TAM", name: "Tamil",               code: "TAM", category: "language", stages: ["primary", "middle", "secondary"] },
    { id: "SV-SUB-HIN", name: "Hindi",               code: "HIN", category: "language", stages: ["middle", "secondary"] },
    { id: "SV-SUB-MAT", name: "Mathematics",         code: "MAT", category: "core",     stages: ["primary", "middle", "secondary", "senior"] },
    { id: "SV-SUB-EVS", name: "Environmental Studies", code: "EVS", category: "core",   stages: ["primary"] },
    { id: "SV-SUB-SCI", name: "Science",             code: "SCI", category: "core",     stages: ["middle", "secondary"] },
    { id: "SV-SUB-SST", name: "Social Science",      code: "SST", category: "core",     stages: ["middle", "secondary"] },
    { id: "SV-SUB-PHY", name: "Physics",             code: "PHY", category: "core",     stages: ["senior"] },
    { id: "SV-SUB-CHE", name: "Chemistry",           code: "CHE", category: "core",     stages: ["senior"] },
    { id: "SV-SUB-BIO", name: "Biology",             code: "BIO", category: "core",     stages: ["senior"] },
    { id: "SV-SUB-CSC", name: "Computer Science",    code: "CSC", category: "optional", stages: ["secondary", "senior"] },
    { id: "SV-SUB-CMP", name: "Computer Studies",    code: "CMP", category: "optional", stages: ["primary", "middle"] },
    { id: "SV-SUB-ART", name: "Art & Craft",         code: "ART", category: "activity", stages: ["primary", "middle"] },
    { id: "SV-SUB-PED", name: "Physical Education",  code: "PED", category: "activity", stages: ["primary", "middle", "secondary", "senior"] },
  ],

  // Which subjects carry a written exam. Art and PE are graded, not examined.
  examinable: (s) => s.category === "core" || s.category === "language",

  // Three terms, each with two formative assessments and one summative.
  examCycles: [
    { key: "fa1", name: "Formative Assessment I",  type: "unit_test", max: 20, monthsAgo: 5 },
    { key: "fa2", name: "Formative Assessment II", type: "unit_test", max: 20, monthsAgo: 4 },
    { key: "sa1", name: "Term I Examination",      type: "final",     max: 80, monthsAgo: 3 },
    { key: "fa3", name: "Formative Assessment III", type: "unit_test", max: 20, monthsAgo: 2 },
    { key: "sa2", name: "Term II Examination",     type: "final",     max: 80, monthsAgo: 1 },
  ],
  // Marks out of 100, no credit weighting — a school reports percentages.
  usesCredits: false,

  // ---- people ------------------------------------------------------------
  departments: [
    "Administration", "Primary", "Languages", "Mathematics", "Science",
    "Social Science", "Computer Science", "Physical Education", "Support",
  ],
  teachingTitle: "Teacher",
  seniorTitles: ["Headmistress · Primary", "Senior Teacher", "Coordinator"],
  supportRoles: [
    { role: "Office Assistant", dept: "Administration", salary: [16000, 22000] },
    { role: "Librarian",        dept: "Support",        salary: [22000, 28000] },
    { role: "Lab Assistant",    dept: "Science",        salary: [18000, 24000] },
    { role: "Bus Driver",       dept: "Support",        salary: [17000, 21000] },
    { role: "Attender",         dept: "Support",        salary: [13000, 17000] },
    { role: "Nurse",            dept: "Support",        salary: [20000, 26000] },
  ],
  teacherSalary: [26000, 52000],
  teachersPerDept: 3,

  // ---- money -------------------------------------------------------------
  // Tuition rises with the class. A CBSE day school in Chennai bills three
  // terms plus one-off heads at admission.
  feeHeads: [
    { key: "term1",     label: "Term I",     base: 14000, perClass: 900, share: 1 },
    { key: "term2",     label: "Term II",    base: 14000, perClass: 900, share: 1 },
    { key: "term3",     label: "Term III",   base: 14000, perClass: 900, share: 1 },
    { key: "kit",       label: "Kit Fees",   base: 3200,  perClass: 120, share: 1 },
    { key: "uniform",   label: "Uniform",    base: 2800,  perClass: 60,  share: 0.7 },
    { key: "eca",       label: "ECA",        base: 1800,  perClass: 40,  share: 0.5 },
    { key: "transport", label: "Transport",  base: 9000,  perClass: 0,   share: 0.55, transportOnly: true },
  ],

  expenseCategories: [
    "Salaries", "Electricity & Water", "Bus Fuel", "Bus Maintenance",
    "Lab Consumables", "Library Books", "Stationery", "Housekeeping",
    "Sports Equipment", "Events & Annual Day", "Repairs", "Software & Internet",
  ],

  // ---- operations --------------------------------------------------------
  periodsPerDay: 8,
  workingDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  // Saturday is a half day almost everywhere in Tamil Nadu.
  shortDay: "Sat",
  shortDayPeriods: 4,

  routes: [
    { code: "RT-01", name: "Adyar · Besant Nagar", bus: "TN 09 BX 4412" },
    { code: "RT-02", name: "Thiruvanmiyur · ECR",  bus: "TN 09 BX 4413" },
    { code: "RT-03", name: "Velachery · Guindy",   bus: "TN 09 BX 4414" },
    { code: "RT-04", name: "T. Nagar · Saidapet",  bus: "TN 09 BX 4415" },
    { code: "RT-05", name: "Mylapore · Alwarpet",  bus: "TN 09 BX 4416" },
  ],
  stopsByRoute: {
    "RT-01": ["Adyar Depot", "Indira Nagar", "Kasturba Nagar", "Besant Nagar Bus Stand", "Elliots Beach"],
    "RT-02": ["Thiruvanmiyur Signal", "Kottivakkam", "Palavakkam", "Neelankarai", "Injambakkam"],
    "RT-03": ["Velachery Phoenix", "Guindy Kathipara", "Ekkatuthangal", "Alandur Metro", "Nanganallur"],
    "RT-04": ["T. Nagar Panagal Park", "Mambalam Station", "Saidapet Court", "Little Mount", "Nandanam"],
    "RT-05": ["Mylapore Tank", "Luz Corner", "Alwarpet", "Teynampet", "Royapettah"],
  },

  libraryCategories: ["Fiction", "Reference", "Children", "Science", "Biography", "Tamil Literature", "Competitive"],
  inventoryCategories: ["Stationery", "Lab", "Sports", "Furniture", "Housekeeping", "Electrical", "Library", "Medical"],

  activityNames: [
    "Inter-School Elocution", "District Athletics Meet", "Science Exhibition",
    "Bharatanatyam Recital", "Chess Tournament", "Quiz Competition",
    "Annual Day Drama", "Tamil Essay Writing", "Painting Competition",
    "Football Inter-House", "Silambam Demonstration", "Spell Bee",
  ],

  // ---- volume ------------------------------------------------------------
  // Section sizes drive everything downstream, including whether the books
  // balance. At 8 per section the school had a 1:8 teacher ratio and a
  // payroll worth 123% of its fee income — a roll that small cannot fund a
  // staff that size, and the P&L said so. Mid-teens per section gives a
  // ~1:16 ratio and a school that covers its costs, which is what a fee-
  // funded CBSE school actually looks like.
  studentsPerSection: [14, 20],
  attendanceDays: 55,
};

// ---------------------------------------------------------------------------
// Sirah Institute of Technology — autonomous engineering college, Coimbatore.
//
// Semesters 1–8 across five departments, credit-weighted grading on the
// standard Indian 10-point scale, two internal assessments and one
// end-semester paper per subject. Guardians rather than parents; faculty
// rather than teachers; a migration certificate rather than a TC.
// ---------------------------------------------------------------------------
export const COLLEGE_PROFILE = {
  tenant: "college",
  idPrefix: "SI",

  // Sections here are departments: "3-CSE" is third semester, CSE branch.
  // Same "n-Section" storage shape, so nothing downstream has to change.
  sections: ["CSE", "ECE", "MECH"],
  sectionLabels: {
    CSE: "Computer Science & Engineering",
    ECE: "Electronics & Communication",
    MECH: "Mechanical Engineering",
  },
  classes: [
    { n: 1, stage: "first_year" },
    { n: 2, stage: "first_year" },
    { n: 3, stage: "second_year" },
    { n: 4, stage: "second_year" },
    { n: 5, stage: "third_year" },
    { n: 6, stage: "third_year" },
    { n: 7, stage: "final_year" },
    { n: 8, stage: "final_year" },
  ],

  // Credits are real here: a 4-credit theory paper weighs twice a 2-credit
  // laboratory in the GPA, which is what computeGpa() in lib/institution.js
  // has always been able to do but never had data for.
  subjects: [
    { id: "SI-SUB-MA1", name: "Engineering Mathematics I",   code: "MA8151", category: "core",     credits: 4, stages: ["first_year"] },
    { id: "SI-SUB-PH1", name: "Engineering Physics",         code: "PH8151", category: "core",     credits: 3, stages: ["first_year"] },
    { id: "SI-SUB-CY1", name: "Engineering Chemistry",       code: "CY8151", category: "core",     credits: 3, stages: ["first_year"] },
    { id: "SI-SUB-PSP", name: "Problem Solving & Python",    code: "GE8151", category: "core",     credits: 3, stages: ["first_year"] },
    { id: "SI-SUB-ENG", name: "Technical English",           code: "HS8151", category: "language", credits: 3, stages: ["first_year"] },
    { id: "SI-SUB-DS",  name: "Data Structures",             code: "CS8391", category: "core",     credits: 4, stages: ["second_year"] },
    { id: "SI-SUB-DBM", name: "Database Management Systems", code: "CS8492", category: "core",     credits: 4, stages: ["second_year"] },
    { id: "SI-SUB-OOP", name: "Object Oriented Programming", code: "CS8392", category: "core",     credits: 3, stages: ["second_year"] },
    { id: "SI-SUB-DPC", name: "Digital Principles & Design", code: "EC8392", category: "core",     credits: 4, stages: ["second_year"] },
    { id: "SI-SUB-TOM", name: "Theory of Machines",          code: "ME8492", category: "core",     credits: 4, stages: ["second_year"] },
    { id: "SI-SUB-OS",  name: "Operating Systems",           code: "CS8493", category: "core",     credits: 4, stages: ["third_year"] },
    { id: "SI-SUB-CN",  name: "Computer Networks",           code: "CS8591", category: "core",     credits: 4, stages: ["third_year"] },
    { id: "SI-SUB-ALG", name: "Design & Analysis of Algorithms", code: "CS8451", category: "core", credits: 4, stages: ["third_year"] },
    { id: "SI-SUB-SIG", name: "Signals & Systems",           code: "EC8352", category: "core",     credits: 4, stages: ["third_year"] },
    { id: "SI-SUB-HTT", name: "Heat & Mass Transfer",        code: "ME8693", category: "core",     credits: 4, stages: ["third_year"] },
    { id: "SI-SUB-SE",  name: "Software Engineering",        code: "CS8494", category: "core",     credits: 3, stages: ["final_year"] },
    { id: "SI-SUB-ML",  name: "Machine Learning",            code: "CS8082", category: "elective", credits: 3, stages: ["final_year"] },
    { id: "SI-SUB-IOT", name: "Internet of Things",          code: "EC8072", category: "elective", credits: 3, stages: ["final_year"] },
    { id: "SI-SUB-CAD", name: "Computer Aided Design",       code: "ME8691", category: "elective", credits: 3, stages: ["final_year"] },
    { id: "SI-SUB-PRJ", name: "Project Work",                code: "CS8811", category: "core",     credits: 6, stages: ["final_year"] },
    { id: "SI-SUB-LAB", name: "Programming Laboratory",      code: "CS8381", category: "activity", credits: 2, stages: ["first_year", "second_year", "third_year"] },
  ],

  // The project and the laboratory are assessed continuously, not by a
  // three-hour paper, so they stay out of the exam generator.
  examinable: (s) => s.category !== "activity" && s.code !== "CS8811",

  examCycles: [
    { key: "cia1", name: "Internal Assessment I",  type: "unit_test", max: 50, monthsAgo: 4 },
    { key: "cia2", name: "Internal Assessment II", type: "unit_test", max: 50, monthsAgo: 2 },
    { key: "ese",  name: "End Semester Examination", type: "final",   max: 100, monthsAgo: 1 },
  ],
  usesCredits: true,

  departments: [
    "Administration", "Computer Science & Engineering",
    "Electronics & Communication", "Mechanical Engineering",
    "Science & Humanities", "Physical Education", "Support",
  ],
  teachingTitle: "Assistant Professor",
  seniorTitles: ["Professor & Head", "Associate Professor", "Professor"],
  supportRoles: [
    { role: "Office Superintendent", dept: "Administration", salary: [24000, 30000] },
    { role: "Librarian",             dept: "Support",        salary: [28000, 36000] },
    { role: "Lab Instructor",        dept: "Computer Science & Engineering", salary: [22000, 30000] },
    { role: "Technician",            dept: "Mechanical Engineering", salary: [20000, 27000] },
    { role: "Bus Driver",            dept: "Support",        salary: [18000, 23000] },
    { role: "Hostel Warden",         dept: "Support",        salary: [26000, 32000] },
  ],
  teacherSalary: [38000, 92000],
  teachersPerDept: 4,

  // Two semesters a year, billed as a block, plus the heads a residential
  // engineering college actually charges.
  feeHeads: [
    { key: "semester1", label: "Semester I Fees",  base: 46000, perClass: 1200, share: 1 },
    { key: "semester2", label: "Semester II Fees", base: 46000, perClass: 1200, share: 1 },
    { key: "lab",       label: "Laboratory Fees",  base: 6500,  perClass: 250,  share: 1 },
    { key: "exam",      label: "Examination Fees", base: 2400,  perClass: 60,   share: 1 },
    { key: "library",   label: "Library Fees",     base: 1500,  perClass: 0,    share: 1 },
    { key: "hostel",    label: "Hostel Fees",      base: 62000, perClass: 0,    share: 0.42 },
    { key: "transport", label: "Transport",        base: 16000, perClass: 0,    share: 0.34, transportOnly: true },
  ],

  expenseCategories: [
    "Salaries", "Electricity & Water", "Laboratory Equipment", "Hostel Mess",
    "Bus Fuel", "Bus Maintenance", "Library & Journals", "Software Licences",
    "Placement & Training", "Research & Consumables", "Housekeeping",
    "Campus Maintenance", "NAAC & Accreditation", "Sports & Cultural",
  ],

  periodsPerDay: 7,
  workingDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  shortDay: "Sat",
  shortDayPeriods: 4,

  routes: [
    { code: "RT-01", name: "Gandhipuram · Peelamedu", bus: "TN 38 CQ 7701" },
    { code: "RT-02", name: "RS Puram · Saibaba Colony", bus: "TN 38 CQ 7702" },
    { code: "RT-03", name: "Singanallur · Hopes",     bus: "TN 38 CQ 7703" },
    { code: "RT-04", name: "Mettupalayam Road",        bus: "TN 38 CQ 7704" },
  ],
  stopsByRoute: {
    "RT-01": ["Gandhipuram Stand", "Cross Cut Road", "Lakshmi Mills", "Peelamedu", "Hope College"],
    "RT-02": ["RS Puram Water Tank", "Saibaba Colony", "Thudiyalur Road", "Vadavalli", "Kovaipudur"],
    "RT-03": ["Singanallur Bus Stand", "Ondipudur", "Hopes College", "Nava India", "Uppilipalayam"],
    "RT-04": ["Thudiyalur", "Kurumbapalayam", "Periyanaickenpalayam", "Narasimhanaickenpalayam", "Saravanampatti"],
  },

  libraryCategories: ["Computer Science", "Electronics", "Mechanical", "Mathematics", "Reference", "Competitive", "Journals"],
  inventoryCategories: ["Laboratory", "Computers", "Furniture", "Electrical", "Workshop", "Housekeeping", "Sports", "Hostel"],

  activityNames: [
    "Inter-College Hackathon", "IEEE Paper Presentation", "Smart India Hackathon",
    "Robotics Championship", "Technical Symposium", "Coding Contest",
    "Anna University Sports Meet", "SAE BAJA", "Cultural Fest — Kalanjiyam",
    "Industry Internship", "NPTEL Certification", "Project Expo",
  ],

  // Engineering runs larger cohorts than a school does; ~1:24 faculty to
  // students is normal for an affiliated college.
  studentsPerSection: [10, 14],
  attendanceDays: 55,
};

export const PROFILES = {
  school: SCHOOL_PROFILE,
  college: COLLEGE_PROFILE,
};
