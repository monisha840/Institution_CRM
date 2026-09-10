// Tenant registry — the two institutions this deployment serves.
//
// Sirah CRM is multi-tenant: one Supabase project, one codebase, two
// completely separate institutions. Every data table carries a `tenant`
// column and every query is scoped to it (see lib/supabase.js), so a school
// row can never appear inside the college and vice versa.
//
// The tenant is chosen at the login screen, travels in the signed session
// JWT, and is read back per-request. Nothing here is a runtime setting —
// swapping an institution's name or address is an edit to this file plus a
// re-seed, not a database migration.
//
// Adding a third tenant is: one entry below, one seed profile, done.

export const TENANT_IDS = ["school", "college"];

export const DEFAULT_TENANT = "school";

// Identity for each institution. `institutionType` drives the vocabulary
// layer in lib/institution.js (Class↔Semester, Parent↔Guardian, …); every
// other field is real branding that receipts, transfer certificates,
// exports, WhatsApp messages and the login screen all read from here
// instead of hardcoding a string.
export const TENANTS = {
  school: {
    id: "school",
    institutionType: "school",

    name: "Sirah Vidyalaya",
    shortName: "Sirah Vidyalaya",
    legalName: "Sirah Vidyalaya Senior Secondary School",
    tagline: "Senior Secondary · CBSE",

    // Governing body. A school of this size in India is almost always run by
    // a registered educational trust, and that name is what a fee receipt
    // and an 80G donation receipt must legally carry.
    trustName: "Sirah Education Trust",
    trustRegNo: "TN/CHN/1274/2009",
    trustPan: "AAATS4821K",
    trust80g: "80G · AAATS4821KF2024701",

    affiliation: "Affiliated to CBSE, New Delhi · Affiliation No. 1930482",
    recognition: "Recognised by the Directorate of School Education, Tamil Nadu",

    addressLine1: "142, Sardar Patel Road",
    addressLine2: "Adyar, Chennai",
    city: "Chennai",
    state: "Tamil Nadu",
    pincode: "600020",
    phone: "+91 44 2441 8890",
    mobile: "+91 98400 18890",
    email: "office@sirahvidyalaya.edu.in",
    website: "www.sirahvidyalaya.edu.in",
    emailDomain: "sirahvidyalaya.edu.in",

    upi: "sirahvidyalaya@hdfcbank",
    upiPayeeName: "Sirah Vidyalaya",
    bankName: "HDFC Bank · Adyar Branch",
    bankAccount: "50200048817293",
    bankIfsc: "HDFC0000521",

    academicYear: "2026-27",
    // Terms, not semesters. Drives the fee calendar and the exam cycle.
    termNames: ["Term I", "Term II", "Term III"],
    // Login-screen copy.
    loginHeadline: "One login for the entire school.",
    loginBlurb:
      "Fees, attendance, timetables, parent messaging — everything your teachers and families need, in one place.",
  },

  college: {
    id: "college",
    institutionType: "college",

    name: "Sirah Institute of Technology",
    shortName: "Sirah Institute",
    legalName: "Sirah Institute of Technology",
    tagline: "Autonomous · Engineering & Technology",

    trustName: "Sirah Education Trust",
    trustRegNo: "TN/CBE/2216/2011",
    trustPan: "AAATS4821K",
    trust80g: "80G · AAATS4821KF2024701",

    affiliation: "Affiliated to Anna University · Autonomous since 2019",
    recognition: "Approved by AICTE, New Delhi · NAAC 'A' Grade",

    addressLine1: "Sirah Campus, Thudiyalur Road",
    addressLine2: "Saravanampatti, Coimbatore",
    city: "Coimbatore",
    state: "Tamil Nadu",
    pincode: "641035",
    phone: "+91 422 268 4400",
    mobile: "+91 96000 84400",
    email: "office@sirahinstitute.ac.in",
    website: "www.sirahinstitute.ac.in",
    emailDomain: "sirahinstitute.ac.in",

    upi: "sirahinstitute@hdfcbank",
    upiPayeeName: "Sirah Institute of Technology",
    bankName: "HDFC Bank · Saravanampatti Branch",
    bankAccount: "50200061142870",
    bankIfsc: "HDFC0001183",

    academicYear: "2026-27",
    // Odd/even semester calendar, the way an Indian autonomous college runs.
    termNames: ["Semester (Odd)", "Semester (Even)"],
    loginHeadline: "One login for the whole campus.",
    loginBlurb:
      "Semester fees, attendance, internals and results, faculty workload — one system for every department.",
  },
};

/** Normalise anything into a known tenant id. Unknown input → the default. */
export function normalizeTenant(raw) {
  const t = String(raw || "").trim().toLowerCase();
  return TENANT_IDS.includes(t) ? t : DEFAULT_TENANT;
}

/** Full identity record for a tenant. Always returns a tenant, never null. */
export function tenantConfig(id) {
  return TENANTS[normalizeTenant(id)];
}

/** The institution mode ("school" | "college") a tenant presents as. */
export function tenantInstitutionType(id) {
  return tenantConfig(id).institutionType;
}

/**
 * One-line postal address, the way it prints on a receipt or a certificate.
 * Kept here so the receipt renderer, the TC renderer and the PDF exporter
 * can never drift apart.
 */
export function tenantAddress(id) {
  const t = tenantConfig(id);
  return `${t.addressLine1}, ${t.addressLine2} ${t.pincode}`;
}

/** The public-facing option list the login screen renders as a toggle. */
export function tenantOptions() {
  return TENANT_IDS.map((id) => {
    const t = TENANTS[id];
    return {
      id,
      label: t.institutionType === "college" ? "College" : "School",
      name: t.name,
      tagline: t.tagline,
      city: t.city,
    };
  });
}
