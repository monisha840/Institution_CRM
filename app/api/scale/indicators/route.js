import { NextResponse } from "next/server";
import { SCALE_DOMAINS, SCALE_INDICATORS, SCALE_DEFAULT_DOMAIN_WEIGHTS, SCALE_SCALES } from "@/lib/scale";
import { readSettings } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Returns the canonical SCALE catalogue (domains + 4 indicators each)
// plus the active composite weights — defaults from scale.js, with any
// admin override read from app_settings.scale.weights.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  let weights = SCALE_DEFAULT_DOMAIN_WEIGHTS;
  try {
    const settings = await readSettings();
    const w = settings?.scale?.weights;
    if (w && typeof w === "object") {
      const merged = { ...SCALE_DEFAULT_DOMAIN_WEIGHTS };
      for (const k of Object.keys(merged)) {
        const v = Number(w[k]);
        if (Number.isFinite(v) && v >= 0) merged[k] = v;
      }
      weights = merged;
    }
  } catch {}
  return NextResponse.json({ ok: true, domains: SCALE_DOMAINS, indicators: SCALE_INDICATORS, scales: SCALE_SCALES, weights });
}
