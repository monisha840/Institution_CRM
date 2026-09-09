// Demo accounts seeded on first run. Same plain passwords are shown on the
// login page hint card so testers can sign in. Hashed before storage.

import { listUsers, createUser, getUserByEmail } from "./db.js";
import { hashPassword } from "./auth.js";

// Demo accounts auto-created in dev mode (NODE_ENV !== "production") so
// engineers don't have to manually onboard themselves on every fresh
// install. Production is gated by login/page.jsx — these never seed there.
//
// Teacher + Parent demo accounts were removed: in a real school the
// teacher roster lives in the staff table (managed via the Staff screen)
// and parents are auto-provisioned with a generated password when an
// admin creates a parent login from the Students screen. Keeping demo
// rows for them caused the Classes "Pick a teacher" dropdown to show
// Anita Kumar even when the actual staff list was empty.
export const DEMO_ACCOUNTS = [
  { id: "USR-ADMIN", email: "admin@school.com", password: "admin123", role: "admin", name: "Super Admin" },
  { id: "USR-DIRECTOR", email: "director@school.com", password: "director123", role: "academic_director", name: "Academic Director" },
  { id: "USR-PRINCIPAL", email: "principal@school.com", password: "principal123", role: "principal", name: "Rashmi Iyer" },
  // Two finance roles introduced in v2. School Accountant sees school
  // finance only (fees + school expenses); Trust Accountant sees trust
  // finance only (donations + trust expenses).
  { id: "USR-SCHOOL-ACC", email: "school.accountant@school.com", password: "school123", role: "school_accountant", name: "School Accountant" },
  { id: "USR-TRUST-ACC",  email: "trust.accountant@school.com",  password: "trust123",  role: "trust_accountant",  name: "Trust Accountant"  },
];

export async function ensureDemoUsers() {
  const existing = await listUsers();
  const have = new Set(existing.map((u) => u.email));
  const created = [];
  for (const a of DEMO_ACCOUNTS) {
    if (have.has(a.email)) continue;
    const dup = await getUserByEmail(a.email);
    if (dup) continue;
    const passwordHash = await hashPassword(a.password);
    const row = await createUser({
      id: a.id, email: a.email, passwordHash,
      role: a.role, name: a.name, linkedId: a.linkedId || null,
    });
    created.push({ email: row.email, role: row.role });
  }
  return created;
}
