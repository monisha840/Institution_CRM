#!/usr/bin/env node
// Wipe the local file-store fallback (data/db.json) of all test data
// while preserving library + libraryLoans + inventory_categories — the
// file-side mirror of the production SQL wipe at
// backend/migrations/2026-06-04-production-wipe.sql.
//
// Run from the project root:
//   node backend/scripts/wipe-local-db.js
//
// Only touches the JSON file; never connects to Supabase. Run the SQL
// migration in Supabase SQL Editor for the production side.

const fs = require("node:fs");
const path = require("node:path");

const DB_PATH = path.resolve(__dirname, "..", "..", "data", "db.json");

if (!fs.existsSync(DB_PATH)) {
  console.error(`[wipe] no file at ${DB_PATH} — nothing to do`);
  process.exit(0);
}

const raw = fs.readFileSync(DB_PATH, "utf8");
let db;
try {
  db = JSON.parse(raw);
} catch (e) {
  console.error(`[wipe] db.json is not valid JSON: ${e.message}`);
  process.exit(1);
}

// Snapshot the counts BEFORE so we can show what got cleared.
const before = {};
for (const key of Object.keys(db)) {
  if (Array.isArray(db[key])) before[key] = db[key].length;
}

// Keys to PRESERVE (mirrors the production SQL — anything not in this set
// gets emptied if it's an array).
const PRESERVE = new Set([
  "library",
  "libraryLoans",
  "inventoryCategories",
  "users",
  "rolePermissions",
  "roleFeatureAccess",
  "customRoles",
  "appSettings",
  "subjects",
  "classes",
  "expenseCategories",
  "messageTemplates",
  "recipientLists",
]);

const wiped = [];
const kept = [];

for (const key of Object.keys(db)) {
  if (!Array.isArray(db[key])) continue;
  if (PRESERVE.has(key)) {
    kept.push(`${key} (${db[key].length})`);
    continue;
  }
  if (db[key].length > 0) {
    wiped.push(`${key} (${db[key].length} → 0)`);
    db[key] = [];
  }
}

fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

console.log("[wipe] data/db.json cleaned.");
console.log("");
console.log("Wiped:");
for (const w of wiped) console.log("  -", w);
console.log("");
console.log("Preserved:");
for (const k of kept) console.log("  -", k);
console.log("");
console.log("Restart the dev server to see a clean dashboard.");
