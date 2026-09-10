#!/usr/bin/env node
// Compare the seeder's generated columns against the live database schema.
//
//   node scripts/check-seed-columns.js
//
// PostgREST rejects an insert naming a column that does not exist, one
// column at a time, which turns a schema drift into a slow sequence of
// half-applied seeds. This reads the actual schema from PostgREST's OpenAPI
// document and reports every mismatch in one pass, before anything is
// written.

const { BASE, request } = require("./supabase-rest");

async function liveSchema() {
  const res = await fetch(`${BASE}/rest/v1/`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/openapi+json",
    },
  });
  if (!res.ok) throw new Error(`schema fetch failed: ${res.status}`);
  const spec = await res.json();
  const out = {};
  for (const [name, def] of Object.entries(spec.definitions || {})) {
    out[name] = def.properties || {};
  }
  return out;
}

// Does a generated value fit the column PostgREST declares?
//
// Only flags what Postgres actually rejects — a word into an integer
// column, an object into a scalar. Postgres coerces plenty happily (a
// number into text, an ISO string into timestamptz) and flagging those
// would bury the real problems.
function typeMismatch(value, prop) {
  if (value === null || value === undefined) return null;
  const t = prop.type;
  const fmt = prop.format || "";

  const numeric = t === "integer" || t === "number"
    || /^(int|numeric|double|real|bigint|smallint)/.test(fmt);
  if (numeric && typeof value !== "number") {
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return null;
    return `expected ${fmt || t}, got ${JSON.stringify(value)}`;
  }
  if (t === "boolean" && typeof value !== "boolean") {
    return `expected boolean, got ${JSON.stringify(value)}`;
  }
  if (t === "string" && typeof value === "object" && !/json/.test(fmt)) {
    return `expected ${fmt || "text"}, got ${Array.isArray(value) ? "an array" : "an object"}`;
  }
  return null;
}

async function main() {
  const schema = await liveSchema();
  const { PROFILES } = await import("./seed/profiles.js");
  const { buildTenant } = await import("./seed/build.js");

  let problems = 0;
  const missingTables = new Set();
  const unknownColumns = new Map(); // table -> Set(column)
  const typeErrors = new Map();     // "table.column" -> description

  for (const [id, profile] of Object.entries(PROFILES)) {
    const { tables } = buildTenant(profile);
    for (const [table, rows] of Object.entries(tables)) {
      const live = schema[table];
      if (!live) { missingTables.add(table); continue; }
      const used = new Set();
      for (const row of rows) {
        for (const k of Object.keys(row)) if (!k.startsWith("_")) used.add(k);
      }
      for (const col of used) {
        if (col === "tenant") continue; // added by the orchestrator
        if (!(col in live)) {
          if (!unknownColumns.has(table)) unknownColumns.set(table, new Set());
          unknownColumns.get(table).add(col);
        }
      }

      // Type-check against the first row that actually sets each column —
      // a null says nothing about the intended type, so keep looking.
      for (const col of used) {
        if (!(col in live)) continue;
        for (const row of rows) {
          if (row[col] === null || row[col] === undefined) continue;
          const bad = typeMismatch(row[col], live[col]);
          if (bad) {
            const key = `${table}.${col}`;
            if (!typeErrors.has(key)) typeErrors.set(key, bad);
          }
          break;
        }
      }
    }
  }

  if (missingTables.size) {
    problems++;
    console.log("\nTables the seeder writes that do not exist:");
    for (const t of [...missingTables].sort()) console.log(`  ${t}`);
  }

  if (unknownColumns.size) {
    problems++;
    console.log("\nColumns the seeder writes that the schema does not have:");
    for (const [t, cols] of [...unknownColumns].sort()) {
      console.log(`  ${t.padEnd(24)} ${[...cols].sort().join(", ")}`);
    }
  }

  if (typeErrors.size) {
    problems++;
    console.log("\nColumns whose generated value does not match the column type:");
    for (const [k, v] of [...typeErrors].sort()) {
      console.log(`  ${k.padEnd(34)} ${v}`);
    }
  }

  // The reverse direction is informational, not a failure: a column the
  // seeder leaves unset simply comes out null, which is often correct.
  if (!problems) console.log("\nEvery generated column exists in the live schema.");

  console.log("");
  process.exit(problems ? 1 : 0);
}

main().catch((e) => { console.error("Failed:", e.message); process.exit(1); });
