// Seed data — Vidyalaya360 CRM
// All sample records have been removed. Only structural metadata remains
// (class numbers, role definitions, UI defaults). The app starts empty
// and is populated through the UI / API.

export const CLASSES = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
  n,
  label: `Class ${n}`,
  sections: ["A", "B"],
  students: 0,
}));

const ZERO_KPI = { value: 0, delta: "", deltaDir: "", sub: "" };

export const KPIS = {
  students: ZERO_KPI,
  collected: ZERO_KPI,
  pending: ZERO_KPI,
  balance: ZERO_KPI,
  income: ZERO_KPI,
  expense: ZERO_KPI,
  staff: ZERO_KPI,
  interns: ZERO_KPI,
  complaints: ZERO_KPI,
  enquiries: ZERO_KPI,
  transport: { value: "—", delta: "", deltaDir: "", sub: "" },
  donors: ZERO_KPI,
};

export const CLASS_STRENGTH = [];
export const RECENT_FEES = [];
export const PENDING_FEES = [];
export const ACTIVITIES = [];
export const ROUTES = [];
export const COMPLAINTS = [];
export const ENQUIRIES = [];
export const INVENTORY = [];
export const STAFF = [];
export const DONORS = [];
export const INCOME_SERIES = [];
export const AUTOMATIONS = [];
export const SCHOOLS = [];

export const TRUST_KPIS = {
  students: { value: "0", delta: "", sub: "" },
  collected: { value: "0%", delta: "", sub: "" },
  donations: { value: "₹0", delta: "", sub: "" },
  teacherNPS: { value: "—", delta: "", sub: "" },
};

export const ANOMALIES = [];
export const DONATION_PIPELINE = [];
export const COMPLIANCE = [];
export const AI_BRIEF = [];

export const ROLES = [
  { k: "super", label: "Super Admin", icon: "shield" },
  { k: "principal", label: "Principal", icon: "school" },
  { k: "teacher", label: "Teacher", icon: "book" },
  { k: "parent", label: "Parent", icon: "heart" },
];

export const USERS = [];
export const AUDIT = [];

export const DEFAULTS = {
  theme: "light",
  role: "principal",
  view: "desktop",
  density: "compact",
  sidebar: "expanded",
  accent: "amber",
};
