#!/usr/bin/env node
// Seed both institutions.
//
//   node scripts/seed-tenants.js --check          verify the migration ran
//   node scripts/seed-tenants.js --dry-run        build and report, write nothing
//   node scripts/seed-tenants.js --tenant=school  one institution only
//   node scripts/seed-tenants.js                  both, replacing what is there
//
// Destructive by design: a tenant's existing rows are deleted before its
// fresh ones are written, because a partial overlay of two datasets is worse
// than either. Run scripts/backup-supabase.js first — the script refuses to
// start if there is no backup on disk.
//
// The database has no cross-tenant transaction, so deletes and inserts are
// ordered to keep foreign keys satisfied at every step: children before
// parents on the way out, parents before children on the way in.

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { ROOT, selectAll, insertAll, deleteTenant, request, hasTenantColumn } = require("./supabase-rest");

// Insert order. Parents first: users and students are referenced by other
// tables, so they have to exist before the rows that point at them.
const INSERT_ORDER = [
  "app_settings", "schools",
  "classes", "subjects",
  "users", "staff", "students",
  "routes",
  "expense_categories", "inventory_categories",
  "pending_fees", "recent_fees",
  "daily_logs", "teacher_attendance", "transport_attendance",
  "timetable", "syllabus",
  "exams", "exam_marks",
  "library", "library_loans",
  "inventory", "inventory_movements",
  "expenses",
  "enquiries", "complaints",
  "tasks", "meetings",
  "leave_requests", "remarks_rewards", "student_activities",
  "staff_awards", "government_documents", "tc_requests",
  "message_templates", "broadcasts", "messages", "notifications",
  "activities", "audit_log",
];

// Delete order is the reverse, so nothing is removed while a live row still
// references it.
const DELETE_ORDER = [...INSERT_ORDER].reverse();

function parseArgs(argv) {
  const out = { tenants: null, dryRun: false, check: false, force: false };
  for (const a of argv.slice(2)) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--check") out.check = true;
    else if (a === "--force") out.force = true;
    else if (a.startsWith("--tenant=")) out.tenants = [a.split("=")[1]];
  }
  return out;
}

/** The migration has to have run, or every insert fails on a missing column. */
async function checkMigration() {
  const probes = ["students", "users", "app_settings", "classes", "daily_logs", "exam_marks"];
  const missing = [];
  for (const t of probes) {
    if (!(await hasTenantColumn(t))) missing.push(t);
  }
  return missing;
}

function newestBackup() {
  const dir = path.join(ROOT, "backups");
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  return files.length ? path.join(dir, files[files.length - 1]) : null;
}

async function main() {
  const args = parseArgs(process.argv);

  // A dry run only builds the dataset in memory, so it does not need the
  // database at all — useful for exercising the generator before the
  // migration has been applied.
  if (!args.dryRun) {
    console.log("Checking the tenancy migration…");
    const missing = await checkMigration();
    if (missing.length) {
      console.error("\n  The tenant column is missing from: " + missing.join(", "));
      console.error("\n  Run backend/migrations/2026-09-10-multi-tenancy.sql in the");
      console.error("  Supabase SQL editor first, then re-run this script.\n");
      process.exit(1);
    }
    console.log("  tenant column present on every probed table.\n");
    if (args.check) return;
  }

  // Load the ES-module seed builders from CommonJS.
  const { PROFILES } = await import("./seed/profiles.js");
  const { buildTenant } = await import("./seed/build.js");
  const { TENANT_IDS } = await import("../backend/lib/tenants.js");

  const tenants = args.tenants || TENANT_IDS;

  // ---- build ------------------------------------------------------------
  const built = {};
  for (const id of tenants) {
    const profile = PROFILES[id];
    if (!profile) {
      console.error(`Unknown tenant "${id}". Known: ${Object.keys(PROFILES).join(", ")}`);
      process.exit(1);
    }
    process.stdout.write(`Building ${id}… `);
    built[id] = buildTenant(profile);
    console.log(`${built[id].summary.totalRows.toLocaleString("en-IN")} rows`);
  }

  console.log("");
  for (const id of tenants) reportSummary(built[id].summary);

  if (args.dryRun) {
    console.log("\n--dry-run: nothing written.\n");
    writeCredentials(built);
    return;
  }

  // ---- safety ------------------------------------------------------------
  const backup = newestBackup();
  if (!backup && !args.force) {
    console.error("\n  No backup found in backups/.");
    console.error("  Run `node scripts/backup-supabase.js` first, or pass --force.\n");
    process.exit(1);
  }
  if (backup) console.log(`\nMost recent backup: ${path.basename(backup)}`);

  // ---- hash passwords ----------------------------------------------------
  console.log("\nHashing passwords…");
  for (const id of tenants) {
    const users = built[id].tables.users || [];
    for (const u of users) {
      u.password_hash = await bcrypt.hash(u._password, 10);
    }
  }

  // ---- write -------------------------------------------------------------
  for (const id of tenants) {
    console.log(`\n${"=".repeat(60)}\n${id.toUpperCase()} — ${built[id].summary.institution}\n${"=".repeat(60)}`);

    console.log("Clearing existing rows…");
    for (const table of DELETE_ORDER) {
      if (!built[id].tables[table]) continue;
      await deleteTenant(table, id);
    }

    console.log("Inserting…");
    for (const table of INSERT_ORDER) {
      const rows = built[id].tables[table];
      if (!rows || !rows.length) continue;
      // Strip the builder's working fields and stamp the tenant.
      const clean = rows.map((row) => {
        const out = { tenant: id };
        for (const [k, v] of Object.entries(row)) {
          if (!k.startsWith("_")) out[k] = v;
        }
        return out;
      });
      process.stdout.write(`  ${table.padEnd(24)}`);
      try {
        const n = await insertAll(table, clean);
        console.log(`${n} rows`);
      } catch (e) {
        console.log("FAILED");
        console.error(`\n  ${e.message}\n`);
        process.exit(1);
      }
    }
  }

  writeCredentials(built);
  console.log("\nDone.\n");
}

function reportSummary(s) {
  const inr = (n) => "₹" + Number(n).toLocaleString("en-IN");
  console.log(`  ${s.institution}`);
  console.log(`    ${s.students} students (+${s.archived} archived) across ${s.cohorts} cohorts, ${s.staff} staff, ${s.logins} logins`);
  console.log(`    ${s.attendanceRows.toLocaleString("en-IN")} attendance rows over ${s.attendanceDays} working days`);
  console.log(`    ${s.exams} exams, ${s.marks.toLocaleString("en-IN")} marks, ${s.timetableSlots.toLocaleString("en-IN")} timetable slots`);
  console.log(`    fees: ${inr(s.feesCollected)} collected of ${inr(s.feesRaised)} raised (${inr(s.feesPending)} outstanding)`);
  if (s.gpaAvg != null) console.log(`    average GPA: ${s.gpaAvg} / 10`);
  console.log("");
}

/**
 * Write the sign-in sheet.
 *
 * Gitignored on purpose. These are working credentials, and a file of
 * working credentials does not belong in version control even for a
 * showcase deployment.
 */
function writeCredentials(built) {
  const lines = [];
  lines.push("# Sign-in credentials");
  lines.push("");
  lines.push("Generated by `scripts/seed-tenants.js`. Not in version control.");
  lines.push("");
  lines.push("Each institution is a separate tenant: separate students, staff, classes,");
  lines.push("fees and settings. Pick the institution on the login screen, then sign in");
  lines.push("with an account from that section — an account from one institution will");
  lines.push("not authenticate against the other.");
  lines.push("");
  lines.push("**Rotate every password below before any real deployment.**");
  lines.push("");

  for (const [id, data] of Object.entries(built)) {
    lines.push(`## ${data.summary.institution}`);
    lines.push("");
    lines.push(`Login screen: choose **${id === "college" ? "College" : "School"}**`);
    lines.push("");

    const groups = [
      ["Administration", (u) => !["teacher", "parent"].includes(u.role)],
      ["Teaching staff", (u) => u.role === "teacher"],
      [id === "college" ? "Guardians" : "Parents", (u) => u.role === "parent"],
    ];

    for (const [heading, match] of groups) {
      const rows = data.accounts.filter(match);
      if (!rows.length) continue;
      lines.push(`### ${heading}`);
      lines.push("");
      lines.push("| Name | Role | Email | Password |");
      lines.push("| --- | --- | --- | --- |");
      for (const u of rows) {
        lines.push(`| ${u.name} | ${u._title || u.role} | \`${u.email}\` | \`${u._password}\` |`);
      }
      lines.push("");
    }
  }

  const dir = path.join(ROOT, "docs");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, "credentials.md");
  fs.writeFileSync(out, lines.join("\n") + "\n");
  console.log(`\nCredentials written to docs/credentials.md`);
}

main().catch((e) => {
  console.error("\nSeed failed:", e.message);
  console.error(e.stack);
  process.exit(1);
});
