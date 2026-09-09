import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ensureDemoUsers, DEMO_ACCOUNTS } from "@/lib/seed-users";
import LoginScreen from "./LoginScreen";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }) {
  // Already signed in? Bounce back to wherever they were heading.
  const session = await getSession();
  if (session) {
    const next = typeof searchParams?.next === "string" ? searchParams.next : "/";
    redirect(next.startsWith("/") ? next : "/");
  }

  // First-run convenience: seed the canonical demo users idempotently.
  // Production-gated — once deployed to a real school we don't want
  // `admin@school.com / admin123` etc. to keep being re-created on every
  // page load. Real users get added via the Users & Roles screen.
  if (process.env.NODE_ENV !== "production") {
    try { await ensureDemoUsers(); } catch (e) {
      console.warn("[login] seed failed:", e?.message);
    }
  }

  // The login screen no longer renders the password hint card, but we
  // still pass the demo list so dev's role-tile picker can pre-fill the
  // form. In production this list is unused by the UI.
  const demo = process.env.NODE_ENV !== "production"
    ? DEMO_ACCOUNTS.map((a) => ({ email: a.email, password: a.password, role: a.role, name: a.name }))
    : [];
  const next = typeof searchParams?.next === "string" ? searchParams.next : "/";
  return <LoginScreen demo={demo} next={next} />;
}
