// Request-scoped tenant resolution.
//
// Every data query in this app is scoped to exactly one institution. This
// module answers one question — "which tenant is this request for?" — and it
// has to answer it *synchronously*, because lib/supabase.js applies the scope
// at `supabase.from(...)` call time, deep inside otherwise-unchanged code.
//
// How the tenant reaches us:
//
//   1. middleware.js verifies the session JWT on every non-public path and
//      stamps the verified tenant onto the request as `x-sirah-tenant`. It
//      ALWAYS sets that header, so a client-supplied one is overwritten and
//      can never be trusted in. By the time any route handler runs, the value
//      has already been through jwtVerify.
//
//   2. Public paths (login, the admission form, the donor form) have no
//      session yet. Middleware fills the same header from the `?tenant=`
//      query param or the non-sensitive `sirah_tenant` hint cookie. Nothing
//      privileged is reachable on those paths, so an unauthenticated visitor
//      choosing their own tenant is exactly the intent — it is how the login
//      screen's School/College switch works.
//
//   3. Server-side work that runs outside a request scope — the login route
//      resolving a user before a session exists, an admin action that has to
//      reach across tenants, a maintenance script — wraps itself in
//      runAsTenant(), which takes precedence over the header.
//
// The AsyncLocalStorage override is deliberately checked first: it is the
// only channel that can be set programmatically, and code that asks for a
// specific tenant always means it.

import { AsyncLocalStorage } from "node:async_hooks";
import { headers } from "next/headers";
import { normalizeTenant, DEFAULT_TENANT } from "./tenants.js";
import { TENANT_HEADER, TENANT_HINT_COOKIE } from "./tenant-context-shared.js";

// Re-exported so Node-side callers have one import to reach for. The
// definitions live in tenant-context-shared.js because middleware.js runs on
// the Edge runtime and cannot load this file's node:async_hooks import.
export { TENANT_HEADER, TENANT_HINT_COOKIE };

const override = new AsyncLocalStorage();

/**
 * Run `fn` with an explicit tenant, ignoring whatever the request says.
 *
 * Every await inside `fn` inherits the scope, so a whole chain of db.js calls
 * lands in the right tenant without threading a parameter through any of
 * them. Returns whatever `fn` returns (await it if it's async).
 */
export function runAsTenant(tenant, fn) {
  return override.run(normalizeTenant(tenant), fn);
}

/**
 * The tenant this code is running for.
 *
 * Never throws and never returns null — outside any request scope (a script,
 * a module-load-time call) it falls back to the default tenant rather than
 * failing a query that the caller can't recover from.
 */
export function currentTenant() {
  const forced = override.getStore();
  if (forced) return forced;
  try {
    return normalizeTenant(headers().get(TENANT_HEADER));
  } catch {
    // headers() throws outside a request scope.
    return DEFAULT_TENANT;
  }
}

/** True when an explicit runAsTenant() scope is active. */
export function hasTenantOverride() {
  return override.getStore() !== undefined;
}
