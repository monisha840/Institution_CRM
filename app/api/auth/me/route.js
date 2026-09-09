import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({
    ok: true,
    user: {
      id: s.sub, email: s.email, name: s.name, role: s.role,
      linkedId: s.linkedId || null,
      linkedClasses: Array.isArray(s.linkedClasses) ? s.linkedClasses : [],
    },
  });
}
