import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { TENANT_HINT_COOKIE } from "@/lib/tenant-context";
import { normalizeTenant, tenantOptions, TENANTS } from "@/lib/tenants";
import LoginScreen from "./LoginScreen";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }) {
  // Already signed in? Bounce back to wherever they were heading.
  const session = await getSession();
  if (session) {
    const next = typeof searchParams?.next === "string" ? searchParams.next : "/";
    redirect(next.startsWith("/") ? next : "/");
  }

  // Which institution the screen opens on: an explicit ?tenant= wins (so a
  // link can point straight at one), then the hint cookie left by the last
  // sign-in, then the default.
  //
  // No accounts are seeded here. Users are created by scripts/seed-tenants.js
  // and by the app itself when a staff member or student is added — a page
  // load has no business writing credentials into the database.
  const active = normalizeTenant(
    searchParams?.tenant || cookies().get(TENANT_HINT_COOKIE)?.value
  );

  // Only public branding crosses to the client. Nothing here is a secret:
  // it is the name, city and strapline a visitor would read off the gate.
  const institutions = tenantOptions().map((o) => ({
    ...o,
    headline: TENANTS[o.id].loginHeadline,
    blurb: TENANTS[o.id].loginBlurb,
    affiliation: TENANTS[o.id].affiliation,
    emailDomain: TENANTS[o.id].emailDomain,
  }));

  const next = typeof searchParams?.next === "string" ? searchParams.next : "/";
  return <LoginScreen institutions={institutions} initialTenant={active} next={next} />;
}
