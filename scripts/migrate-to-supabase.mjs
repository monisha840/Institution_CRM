// One-shot migration: push existing file-store rows into the new Supabase
// tables (timetable, library, library_loans, inventory_categories).
//
// Usage:
//   node scripts/migrate-to-supabase.mjs
//
// Pre-req: the DDL in backend/lib/schema.sql for the four new tables must
// already be applied to your Supabase project (paste the relevant CREATE
// TABLE statements into the SQL editor, or run the schema file via psql).
//
// Safe to re-run: every insert uses upsert/onConflict so duplicate keys
// don't error out — re-running just refreshes rows that drifted.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

// ---- env loader (reads .env.local manually to avoid pulling in dotenv) ----
function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  const txt = fs.readFileSync(file, "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.+?)\s*$/i);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

// ---- read file store ----
const dbPath = path.join(process.cwd(), "data", "db.json");
if (!fs.existsSync(dbPath)) {
  console.error("data/db.json not found — nothing to migrate.");
  process.exit(1);
}
const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));

// ---- mappers (camel → snake) ----
const toBook = (r) => ({
  id: r.id,
  title: r.title,
  author: r.author ?? "",
  category: r.category ?? "general",
  isbn: r.isbn ?? null,
  shelf: r.shelf ?? null,
  total_copies: Math.max(0, Math.floor(Number(r.totalCopies) || 0)),
  added_at: r.addedAt ?? new Date().toISOString(),
});
const toLoan = (r) => ({
  id: r.id,
  book_id: r.bookId,
  book_title: r.bookTitle ?? null,
  borrower_type: r.borrowerType,
  borrower_id: r.borrowerId,
  borrower_name: r.borrowerName ?? null,
  borrowed_at: r.borrowedAt ?? new Date().toISOString(),
  due_at: r.dueAt ?? null,
  returned_at: r.returnedAt ?? null,
  issued_by: r.issuedBy ?? null,
  returned_by: r.returnedBy ?? null,
});
const toTimetable = (r) => ({
  id: r.id, cls: r.cls, day: r.day, period: Number(r.period),
  subject: r.subject,
  teacher_id: r.teacherId ?? null,
  teacher_name: r.teacherName ?? null,
  room: r.room ?? null,
  updated_at: r.updatedAt ?? new Date().toISOString(),
});

// ---- run migration in 4 phases, reporting per-table counts ----
async function pushTable(name, rows, mapper, conflictKey = "id") {
  if (!rows || rows.length === 0) {
    console.log(`  ${name}: no rows in file store, skipping.`);
    return;
  }
  // Chunk to keep payloads under PostgREST limits.
  const chunk = 200;
  let okN = 0, errN = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const batch = rows.slice(i, i + chunk).map(mapper);
    const { error } = await supabase.from(name).upsert(batch, { onConflict: conflictKey });
    if (error) {
      errN += batch.length;
      console.warn(`  ${name}[${i}..${i + batch.length}]: ${error.message}`);
    } else {
      okN += batch.length;
    }
  }
  console.log(`  ${name}: upserted ${okN} rows${errN ? ` · ${errN} failed` : ""}`);
}

(async () => {
  console.log("Migrating file-store data → Supabase…\n");

  console.log("library:");
  await pushTable("library", db.library || [], toBook, "id");

  console.log("\nlibrary_loans:");
  await pushTable("library_loans", db.libraryLoans || [], toLoan, "id");

  console.log("\ntimetable:");
  await pushTable("timetable", db.timetable || [], toTimetable, "id");

  console.log("\ninventory_categories:");
  const cats = (db.inventoryCategories || []).map((key) => ({ key }));
  await pushTable("inventory_categories", cats, (r) => r, "key");

  console.log("\nDone. The next /api/data fetch will read these from Supabase first.");
})().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
