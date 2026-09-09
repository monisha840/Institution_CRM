import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, getSession } from "@/lib/auth";
import { logAudit } from "@/lib/db";

export async function POST() {
  // logout should *always* succeed at clearing the cookie even if the
  // audit / session lookup throws — a flaky logout is worse than no log.
  try {
    const session = await getSession();
    if (session?.name) {
      try { await logAudit(session.name, "Sign out", session.email || ""); } catch {}
    }
  } catch {}
  cookies().set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return NextResponse.json({ ok: true });
}
