// Core staff logins, per institution.
//
// These are the accounts that exist before anyone has used the system: the
// people who run the place. Everyone else is provisioned from real records —
// a teacher login comes from their staff row, a parent/guardian login from
// their child's admission — which is how a school actually onboards.
//
// Two things this file deliberately is NOT:
//
//   * a login-time fallback. Authentication reads the users table and only
//     the users table. An account that isn't in the database cannot sign in,
//     no matter what is listed here. (The previous build fell back to an
//     in-memory list whenever the database read failed, which meant a
//     transient Supabase error handed out a full admin session.)
//
//   * a set of throwaway credentials. Every password below is distinct and
//     belongs to one named person at one institution. Rotate them before any
//     real deployment — see docs/credentials.md, which the seeder writes.
//
// The seeder (scripts/seed-tenants.js) hashes these with bcrypt and inserts
// them. Changing a password here has no effect until you re-seed, or until
// an admin resets it from the Users & Roles screen.

import { TENANT_IDS, tenantConfig } from "./tenants.js";

// ---------------------------------------------------------------------------
// Sirah Vidyalaya — a CBSE senior secondary school.
//
// Titles follow how an Indian school is actually staffed: a Principal above a
// Vice Principal who owns academics, an Office Superintendent on fees, and a
// Transport In-charge who owns the buses.
// ---------------------------------------------------------------------------
const SCHOOL_ACCOUNTS = [
  {
    id: "SV-USR-001", role: "admin",
    name: "Meera Krishnan", title: "Systems Administrator",
    local: "meera.krishnan", password: "Vidyalaya@8241",
    phone: "+91 98400 21188",
  },
  {
    id: "SV-USR-002", role: "principal",
    name: "Rashmi Venkatesh", title: "Principal",
    local: "principal", password: "Vidyalaya@3907",
    phone: "+91 98400 21102",
  },
  {
    id: "SV-USR-003", role: "academic_director",
    name: "Ganesh Murthy", title: "Vice Principal · Academics",
    local: "ganesh.murthy", password: "Vidyalaya@5620",
    phone: "+91 98400 21134",
  },
  {
    id: "SV-USR-004", role: "school_accountant",
    name: "Anand Subramanian", title: "Accounts Officer",
    local: "accounts", password: "Vidyalaya@4715",
    phone: "+91 98400 21156",
  },
  {
    id: "SV-USR-005", role: "fees_manager",
    name: "Lakshmi Narayanan", title: "Office Superintendent · Fees",
    local: "fees", password: "Vidyalaya@6382",
    phone: "+91 98400 21167",
  },
  {
    id: "SV-USR-006", role: "transport_manager",
    name: "Karthik Rajan", title: "Transport In-charge",
    local: "transport", password: "Vidyalaya@9034",
    phone: "+91 98400 21173",
  },
];

// ---------------------------------------------------------------------------
// Sirah Institute of Technology — an autonomous engineering college.
//
// Different shape of organisation: a Controller of Examinations, a Dean
// rather than a Vice Principal, a Bursar rather than an Accounts Officer.
// The underlying role keys are the same; only the people and titles differ.
// ---------------------------------------------------------------------------
const COLLEGE_ACCOUNTS = [
  {
    id: "SI-USR-001", role: "admin",
    name: "Vidhya Balasubramanian", title: "Systems Administrator",
    local: "vidhya.b", password: "Institute@7318",
    phone: "+91 96000 41188",
  },
  {
    id: "SI-USR-002", role: "principal",
    name: "Dr. S. Ramanathan", title: "Principal",
    local: "principal", password: "Institute@2954",
    phone: "+91 96000 41102",
  },
  {
    id: "SI-USR-003", role: "academic_director",
    name: "Dr. Priya Shankar", title: "Dean · Academics",
    local: "dean.academics", password: "Institute@6071",
    phone: "+91 96000 41134",
  },
  {
    id: "SI-USR-004", role: "school_accountant",
    name: "Mohan Raghavan", title: "Bursar",
    local: "accounts", password: "Institute@5286",
    phone: "+91 96000 41156",
  },
  {
    id: "SI-USR-005", role: "fees_manager",
    name: "Deepa Sundaram", title: "Fees Section In-charge",
    local: "fees", password: "Institute@8443",
    phone: "+91 96000 41167",
  },
  {
    id: "SI-USR-006", role: "transport_manager",
    name: "Suresh Kumar", title: "Transport Officer",
    local: "transport", password: "Institute@3729",
    phone: "+91 96000 41173",
  },
];

const BY_TENANT = {
  school: SCHOOL_ACCOUNTS,
  college: COLLEGE_ACCOUNTS,
};

/**
 * The core staff accounts for one institution, with e-mail addresses
 * resolved against that institution's own domain.
 */
export function coreAccounts(tenantId) {
  const t = tenantConfig(tenantId);
  return (BY_TENANT[t.id] || []).map((a) => ({
    ...a,
    tenant: t.id,
    email: `${a.local}@${t.emailDomain}`,
  }));
}

/** Every core account across every institution — for the seeder and docs. */
export function allCoreAccounts() {
  return TENANT_IDS.flatMap((id) => coreAccounts(id));
}

// ---------------------------------------------------------------------------
// Derived logins.
//
// A staff member's login is their work address; a guardian's is a stable
// address derived from the student. Both are created by the app when the
// underlying record is created, so these two helpers are the single
// definition of the format and are shared by the seeder and the runtime.
// ---------------------------------------------------------------------------

/** Slug a person's name into the local part of an e-mail address. */
export function emailSlug(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD").replace(/\p{M}+/gu, "")
    .replace(/^(dr|mr|mrs|ms|prof)\.?\s+/, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 40);
}

/** Work address for a staff member at this institution. */
export function staffEmail(tenantId, name) {
  return `${emailSlug(name)}@${tenantConfig(tenantId).emailDomain}`;
}

/**
 * Login address for a student's parent or guardian.
 *
 * Namespaced under `parents.` so it can never collide with a staff address,
 * and derived from the student rather than the guardian's own name because
 * one guardian can have two children on roll.
 */
export function guardianEmail(tenantId, studentName, studentId) {
  const base = emailSlug(studentName) || String(studentId || "").toLowerCase();
  return `${base}@parents.${tenantConfig(tenantId).emailDomain}`;
}
