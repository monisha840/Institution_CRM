// Tenant plumbing constants, in a module both runtimes can load.
//
// middleware.js runs on the Edge runtime, which has no `node:async_hooks`
// and no `next/headers`. lib/tenant-context.js needs both, so importing it
// from middleware would break the build. These two names are all the Edge
// side actually needs, so they live here and tenant-context.js re-exports
// them — one definition, both runtimes.

/** Request header middleware stamps with the verified tenant id. */
export const TENANT_HEADER = "x-sirah-tenant";

/**
 * Remembers which institution the last sign-in used, so the login screen
 * re-opens on the same one. Deliberately not httpOnly and carries no
 * authority whatsoever — only the signed session JWT grants access to a
 * tenant's data. Tampering with this cookie changes nothing but which side
 * of the login toggle is pre-selected.
 */
export const TENANT_HINT_COOKIE = "sirah_tenant";
