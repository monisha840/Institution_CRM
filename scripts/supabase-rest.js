// Minimal Supabase REST helper for the maintenance scripts in this folder.
//
// These scripts run in plain Node, outside Next.js, so they cannot use
// backend/lib/db.js (which reaches for next/headers) or the tenant-scoped
// client in backend/lib/supabase.js. They talk to PostgREST directly with the
// service-role key and pass `tenant` explicitly — that is deliberate: a
// backup or a seed is exactly the kind of cross-tenant work the application
// client is designed to make impossible by accident.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

/** Load .env.local without adding a dotenv dependency. */
function loadEnv() {
  const file = path.join(ROOT, ".env.local");
  if (!fs.existsSync(file)) {
    throw new Error(`No .env.local at ${file}`);
  }
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  }
  return { url: url.replace(/\/+$/, ""), key };
}

const { url: BASE, key: KEY } = loadEnv();

const headers = (extra = {}) => ({
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
  ...extra,
});

async function request(method, pathAndQuery, body, extraHeaders) {
  const res = await fetch(`${BASE}/rest/v1/${pathAndQuery}`, {
    method,
    headers: headers(extraHeaders),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  if (text) {
    try { json = JSON.parse(text); } catch { json = text; }
  }
  return { ok: res.ok, status: res.status, json, headers: res.headers };
}

/** Every row of a table, paged so we never truncate at PostgREST's limit. */
async function selectAll(table, query = "") {
  const out = [];
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const q = `${table}?select=*${query ? "&" + query : ""}&limit=${page}&offset=${offset}`;
    const r = await request("GET", q);
    if (!r.ok) {
      // A table that does not exist is not an error for a backup sweep.
      if (r.status === 404) return null;
      throw new Error(`${table}: ${r.status} ${JSON.stringify(r.json)}`);
    }
    const rows = Array.isArray(r.json) ? r.json : [];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

/**
 * Insert rows in chunks.
 *
 * PostgREST rejects a bulk insert whose objects do not all carry the same
 * keys ("All object keys must match") — it builds one INSERT with a single
 * column list. Real rows are ragged: an archived student has archived_at
 * and an active one does not. So every row is widened to the union of keys
 * across the whole table first, with the gaps filled as null, which is what
 * those columns would have held anyway.
 */
async function insertAll(table, rows, chunkSize = 250) {
  if (!rows.length) return 0;

  const allKeys = new Set();
  for (const row of rows) for (const k of Object.keys(row)) allKeys.add(k);
  const keys = [...allKeys];
  const widened = rows.map((row) => {
    const out = {};
    for (const k of keys) out[k] = row[k] === undefined ? null : row[k];
    return out;
  });

  let done = 0;
  for (let i = 0; i < widened.length; i += chunkSize) {
    const chunk = widened.slice(i, i + chunkSize);
    const r = await request("POST", table, chunk, { Prefer: "return=minimal" });
    if (!r.ok) {
      throw new Error(`${table} insert failed at row ${i}: ${r.status} ${JSON.stringify(r.json)}`);
    }
    done += chunk.length;
  }
  return done;
}

/** Delete every row of a table belonging to one tenant. */
async function deleteTenant(table, tenant) {
  const r = await request("DELETE", `${table}?tenant=eq.${encodeURIComponent(tenant)}`, undefined, {
    Prefer: "return=minimal",
  });
  if (!r.ok && r.status !== 404) {
    throw new Error(`${table} delete failed: ${r.status} ${JSON.stringify(r.json)}`);
  }
  return r.ok;
}

/** Row count for a table, or null if the table does not exist. */
async function count(table) {
  const r = await request("GET", `${table}?select=*&limit=1`, undefined, {
    Prefer: "count=exact",
    Range: "0-0",
  });
  if (!r.ok && r.status === 404) return null;
  const cr = r.headers.get("content-range") || "";
  const total = cr.split("/")[1];
  return total === "*" ? 0 : Number(total);
}

/** Does this table have a `tenant` column yet? Tells us if the migration ran. */
async function hasTenantColumn(table) {
  const r = await request("GET", `${table}?select=tenant&limit=1`);
  return r.ok;
}

module.exports = {
  ROOT, BASE, request, selectAll, insertAll, deleteTenant, count, hasTenantColumn,
};
