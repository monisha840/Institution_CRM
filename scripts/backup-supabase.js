#!/usr/bin/env node
// Dump every Supabase table to a timestamped JSON file.
//
//   node scripts/backup-supabase.js
//
// Run this before the multi-tenancy migration and before any re-seed. It is
// the only undo we have: the seeder deletes a tenant's rows before writing
// fresh ones, and PostgREST has no transaction to roll back to.
//
// Output lands in backups/ (gitignored) as one JSON object keyed by table.

const fs = require("fs");
const path = require("path");
const { ROOT, selectAll } = require("./supabase-rest");

// Every table the schema defines. Missing tables are recorded as null rather
// than skipped, so a restore can tell "was empty" from "did not exist".
const TABLES = [
  "students", "pending_fees", "recent_fees", "complaints", "enquiries",
  "daily_logs", "routes", "audit_log", "classes", "activities", "donors",
  "campaigns", "broadcasts", "message_templates", "recipient_lists",
  "inventory", "inventory_movements", "staff", "users", "tasks", "meetings",
  "meeting_rsvps", "volunteers", "volunteer_hours", "chat_threads",
  "chat_messages", "tc_requests", "subjects", "staff_awards",
  "transport_attendance", "teacher_attendance", "exams", "exam_marks",
  "maintenance_logs", "expenses", "documents", "donor_receipts",
  "role_permissions", "schools", "app_settings", "automation_rules",
  "automation_runs", "broadcast_recipients", "timetable", "library",
  "library_loans", "inventory_categories", "syllabus", "roles",
  "user_permissions", "custom_roles", "role_feature_access",
  "expense_categories", "messages", "donor_form_submissions",
  "student_activities", "remarks_rewards", "government_documents",
  "notifications", "leave_requests", "scale_sessions", "scale_entries",
  "scale_support_plans", "scale_daily_rituals", "expense_templates",
  "transport_assignments", "fee_edits",
];

async function main() {
  const dir = path.join(ROOT, "backups");
  fs.mkdirSync(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const out = path.join(dir, `supabase-${stamp}.json`);

  const dump = { takenAt: new Date().toISOString(), tables: {} };
  let totalRows = 0;
  let missing = 0;

  for (const table of TABLES) {
    process.stdout.write(`  ${table.padEnd(26)}`);
    try {
      const rows = await selectAll(table);
      if (rows === null) {
        dump.tables[table] = null;
        missing++;
        console.log("— not in this database");
      } else {
        dump.tables[table] = rows;
        totalRows += rows.length;
        console.log(`${rows.length} row${rows.length === 1 ? "" : "s"}`);
      }
    } catch (e) {
      console.log(`FAILED — ${e.message}`);
      throw e;
    }
  }

  fs.writeFileSync(out, JSON.stringify(dump, null, 1));
  const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
  console.log(`\nBacked up ${totalRows} rows across ${TABLES.length - missing} tables (${missing} absent).`);
  console.log(`→ ${out}  (${mb} MB)`);
}

main().catch((e) => {
  console.error("\nBackup failed:", e.message);
  process.exit(1);
});
