// Edge middleware: gate every page (and most API routes) behind a valid
// session, and resolve which institution the request belongs to.
//
// We only verify the JWT here; per-role authorisation lives in the screens
// and API routes (which call getSession from lib/auth.js to read the same
// payload).
//
// Tenancy: this deployment serves two institutions out of one database, and
// every query downstream is scoped to one of them. Middleware is the only
// place that has both verified the session and not yet run any data access,
// so it is where the tenant is decided and stamped onto the request as
// `x-sirah-tenant`. We ALWAYS set that header — never pass an inbound one
// through — so a client cannot hand itself another institution's data by
// forging a header. See lib/tenant-context.js for the read side.

import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionEdge } from "@/lib/auth-edge";
import { TENANT_HEADER, TENANT_HINT_COOKIE } from "@/lib/tenant-context-shared";
import { normalizeTenant } from "@/lib/tenants";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
  // Public donor form — anyone with the link can submit.
  "/donorform",
  "/api/donor-form",
  // Public admission enquiry form — parents apply online without
  // logging in. The submission lands in the enquiries table for
  // staff to review on the Admissions screen.
  "/admissionform",
  "/api/admissions/public",
];

function isPublic(pathname) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  // Next.js internals + static assets
  if (pathname.startsWith("/_next/")) return true;
  // Anything served from /public — whitelist by extension so static images
  // (school logo, favicons, fonts) load on the login page too. Without
  // this, /logo.png was getting bounced to /login → broken image.
  if (/\.(png|jpe?g|svg|gif|webp|ico|avif|bmp|woff2?|ttf|otf|eot|map)$/i.test(pathname)) {
    return true;
  }
  return false;
}

// Forward the request with the tenant stamped on. Cloning the headers and
// handing them to NextResponse.next({ request }) is the supported way to add
// a header that route handlers and server components can read.
function withTenant(req, tenant) {
  const headers = new Headers(req.headers);
  headers.set(TENANT_HEADER, tenant);
  return NextResponse.next({ request: { headers } });
}

export async function middleware(req) {
  const { pathname, searchParams } = req.nextUrl;

  if (isPublic(pathname)) {
    // No session to read a tenant from. The login screen's School/College
    // switch passes `?tenant=`, and the hint cookie remembers the last
    // choice. Nothing privileged is reachable here, so an unauthenticated
    // visitor picking their own tenant is the intended behaviour — it is
    // how they choose which institution to sign in to.
    const hinted =
      searchParams.get("tenant") ||
      req.cookies.get(TENANT_HINT_COOKIE)?.value;
    return withTenant(req, normalizeTenant(hinted));
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionEdge(token);
  if (session) {
    // The tenant claim was signed into the JWT at login and has just been
    // verified, so this is the authoritative value.
    return withTenant(req, normalizeTenant(session.tenant));
  }

  // For API routes, return 401 instead of redirecting (better client UX).
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  // For page routes, bounce to /login and remember where they were going.
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (pathname !== "/") url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

// Run on everything except _next and static. The function above filters again
// so this matcher just trims the obvious junk early.
export const config = {
  matcher: ["/((?!_next/|favicon.ico).*)"],
};
