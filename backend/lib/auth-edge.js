// Edge-runtime safe subset of lib/auth.js for use in middleware.js.
// Only JWT verification — no bcrypt, no next/headers cookies() helper.

import { jwtVerify } from "jose";

export const SESSION_COOKIE = "vid360_session";

const SECRET_RAW =
  process.env.AUTH_SECRET ||
  "dev-only-insecure-secret-change-me-in-production-please-32chars";
const SECRET = new TextEncoder().encode(SECRET_RAW);

export async function verifySessionEdge(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload;
  } catch {
    return null;
  }
}
