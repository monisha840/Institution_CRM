#!/usr/bin/env node
// Prove the tenant scoping wrapper does what the whole design rests on.
//
//   node scripts/test-tenant-scoping.js
//
// backend/lib/supabase.js wraps the Supabase client's from() so that ~300
// unmodified call sites in db.js become tenant-scoped. If that wrapper is
// wrong, one institution reads the other's students — and nothing else in
// the app would notice, because every call site looks exactly as it did
// before. So it gets tested directly, against a fake PostgREST builder that
// records what would have been sent.

const assert = require("node:assert/strict");

// ---------------------------------------------------------------------------
// A stand-in for PostgrestQueryBuilder / PostgrestFilterBuilder.
//
// from() returns a query builder; select/insert/update/delete/upsert each
// return a *filter* builder, and filters chain on that. Mirroring that shape
// matters: the wrapper relies on it to avoid double-filtering an insert's
// returning clause.
// ---------------------------------------------------------------------------
function makeFakeClient(log) {
  const filterBuilder = (record) => {
    const b = {
      _record: record,
      eq(col, val) { record.filters.push([col, val]); return b; },
      order() { return b; },
      limit() { return b; },
      maybeSingle() { record.terminal = "maybeSingle"; return b; },
      single() { record.terminal = "single"; return b; },
      select(cols) { record.returning = cols ?? "*"; return b; },
    };
    return b;
  };
  return {
    from(table) {
      return {
        select(cols) {
          const rec = { table, op: "select", cols, filters: [] };
          log.push(rec); return filterBuilder(rec);
        },
        insert(rows, opts) {
          const rec = { table, op: "insert", rows, opts, filters: [] };
          log.push(rec); return filterBuilder(rec);
        },
        upsert(rows, opts) {
          const rec = { table, op: "upsert", rows, opts, filters: [] };
          log.push(rec); return filterBuilder(rec);
        },
        update(patch) {
          const rec = { table, op: "update", patch, filters: [] };
          log.push(rec); return filterBuilder(rec);
        },
        delete() {
          const rec = { table, op: "delete", filters: [] };
          log.push(rec); return filterBuilder(rec);
        },
      };
    },
  };
}

// The wrapper, lifted from backend/lib/supabase.js. Kept in step by the
// structural check at the bottom, which fails if the real file drifts.
function scopeConflictTarget(onConflict) {
  const cols = String(onConflict).split(",").map((c) => c.trim()).filter(Boolean);
  if (cols.includes("tenant")) return cols.join(",");
  return ["tenant", ...cols].join(",");
}

function scopeBuilder(builder, tenant) {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      if (prop === "select" || prop === "update" || prop === "delete") {
        return (...args) => value.apply(target, args).eq("tenant", tenant);
      }
      if (prop === "insert" || prop === "upsert") {
        return (rows, options) => {
          const stamp = (r) => ({ ...r, tenant });
          const payload = Array.isArray(rows) ? rows.map(stamp) : stamp(rows);
          const opts =
            prop === "upsert" && options?.onConflict
              ? { ...options, onConflict: scopeConflictTarget(options.onConflict) }
              : options;
          return opts === undefined
            ? value.apply(target, [payload])
            : value.apply(target, [payload, opts]);
        };
      }
      return value.bind(target);
    },
  });
}

function scopedClient(raw, tenant) {
  return new Proxy(raw, {
    get(target, prop, receiver) {
      if (prop !== "from") return Reflect.get(target, prop, receiver);
      return (table) => scopeBuilder(target.from(table), tenant);
    },
  });
}

// ---------------------------------------------------------------------------
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok    ${name}`); }
  catch (e) { failed++; console.log(`  FAIL  ${name}\n          ${e.message}`); }
}

console.log("tenant scoping wrapper\n");

test("a select is filtered to the tenant", () => {
  const log = [];
  const db = scopedClient(makeFakeClient(log), "college");
  db.from("students").select("*");
  assert.deepEqual(log[0].filters, [["tenant", "college"]]);
});

test("the caller's own filters are kept alongside", () => {
  const log = [];
  const db = scopedClient(makeFakeClient(log), "school");
  db.from("students").select("*").eq("id", "SV-STN-1001").maybeSingle();
  assert.deepEqual(log[0].filters, [["tenant", "school"], ["id", "SV-STN-1001"]]);
  assert.equal(log[0].terminal, "maybeSingle");
});

test("an insert is stamped with the tenant", () => {
  const log = [];
  const db = scopedClient(makeFakeClient(log), "college");
  db.from("students").insert({ id: "SI-STN-1", name: "Meera" });
  assert.deepEqual(log[0].rows, { id: "SI-STN-1", name: "Meera", tenant: "college" });
});

test("a bulk insert stamps every row", () => {
  const log = [];
  const db = scopedClient(makeFakeClient(log), "school");
  db.from("daily_logs").insert([{ id: 1 }, { id: 2 }, { id: 3 }]);
  assert.equal(log[0].rows.length, 3);
  assert.ok(log[0].rows.every((r) => r.tenant === "school"));
});

test("insert().select() is NOT double-filtered", () => {
  // The select after an insert is a returning clause, not a query. Adding
  // a tenant filter there would make PostgREST reject the write.
  const log = [];
  const db = scopedClient(makeFakeClient(log), "school");
  db.from("students").insert({ id: "x" }).select().single();
  assert.deepEqual(log[0].filters, [], "returning clause picked up a filter");
  assert.equal(log[0].returning, "*");
});

test("an update is filtered to the tenant", () => {
  const log = [];
  const db = scopedClient(makeFakeClient(log), "college");
  db.from("students").update({ name: "New" }).eq("id", "SI-STN-1");
  assert.deepEqual(log[0].filters, [["tenant", "college"], ["id", "SI-STN-1"]]);
});

test("a delete is filtered to the tenant", () => {
  const log = [];
  const db = scopedClient(makeFakeClient(log), "school");
  db.from("students").delete().eq("id", "SV-STN-1");
  assert.deepEqual(log[0].filters, [["tenant", "school"], ["id", "SV-STN-1"]]);
});

test("an upsert conflict target gains tenant first", () => {
  const log = [];
  const db = scopedClient(makeFakeClient(log), "college");
  db.from("daily_logs").upsert({ student_id: "a", date: "2026-09-01" }, { onConflict: "student_id,date" });
  assert.equal(log[0].opts.onConflict, "tenant,student_id,date");
  assert.equal(log[0].rows.tenant, "college");
});

test("an id-only conflict target becomes tenant,id", () => {
  const log = [];
  const db = scopedClient(makeFakeClient(log), "school");
  db.from("pending_fees").upsert({ id: "f1" }, { onConflict: "id" });
  assert.equal(log[0].opts.onConflict, "tenant,id");
});

test("a conflict target that already names tenant is left alone", () => {
  const log = [];
  const db = scopedClient(makeFakeClient(log), "school");
  db.from("timetable").upsert({ id: "t" }, { onConflict: "tenant,id" });
  assert.equal(log[0].opts.onConflict, "tenant,id");
});

test("an upsert with no options does not invent any", () => {
  const log = [];
  const db = scopedClient(makeFakeClient(log), "school");
  db.from("x").upsert({ id: "1" });
  assert.equal(log[0].opts, undefined);
});

test("two tenants never see each other's filter", () => {
  const log = [];
  const raw = makeFakeClient(log);
  scopedClient(raw, "school").from("students").select("*");
  scopedClient(raw, "college").from("students").select("*");
  assert.deepEqual(log[0].filters, [["tenant", "school"]]);
  assert.deepEqual(log[1].filters, [["tenant", "college"]]);
});

test("the tenant is read per from(), not captured once", () => {
  // The real client resolves currentTenant() inside from(), which is what
  // lets one module-level client serve concurrent requests for different
  // institutions. Simulated here with a moving value.
  const log = [];
  const raw = makeFakeClient(log);
  let current = "school";
  const db = new Proxy(raw, {
    get(t, p, r) {
      if (p !== "from") return Reflect.get(t, p, r);
      return (table) => scopeBuilder(t.from(table), current);
    },
  });
  db.from("students").select("*");
  current = "college";
  db.from("students").select("*");
  assert.deepEqual(log[0].filters, [["tenant", "school"]]);
  assert.deepEqual(log[1].filters, [["tenant", "college"]]);
});

// ---------------------------------------------------------------------------
// Guard against the copy above drifting from the real implementation.
// ---------------------------------------------------------------------------
test("the real supabase.js still wraps from() the same way", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const src = fs.readFileSync(
    path.resolve(__dirname, "..", "backend", "lib", "supabase.js"), "utf8");
  for (const marker of [
    "function scopeBuilder(",
    "function scopeConflictTarget(",
    'if (prop === "select" || prop === "update" || prop === "delete")',
    'if (prop === "insert" || prop === "upsert")',
    'if (prop !== "from") return Reflect.get(target, prop, receiver);',
    "currentTenant()",
  ]) {
    assert.ok(src.includes(marker), `supabase.js no longer contains: ${marker}`);
  }
});

console.log(`\n${passed}/${passed + failed} passed.`);
process.exit(failed ? 1 : 0);
