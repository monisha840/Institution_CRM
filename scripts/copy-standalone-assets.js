// Post-build helper for `output: "standalone"`.
//
// next build emits a self-contained server bundle at .next/standalone/, but
// it deliberately does NOT copy the static assets (.next/static/*) or the
// /public folder into that bundle — the docs leave that up to your deploy
// script. On a VPS that runs `node .next/standalone/server.js`, missing
// those copies means every CSS chunk + JS bundle + favicon 404s and the
// page renders as bare HTML (the symptom: the logo loads, nothing else does).
//
// We also forward .env.production into the standalone bundle when present
// so runtime env vars (Supabase URL / key, Evolution API config) survive the
// pm2 restart. Without this the standalone server starts with a half-empty
// env and silently falls back to the file store.
//
// Safe to re-run; everything is rmdir + copyRecursive.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const STANDALONE = path.join(ROOT, ".next", "standalone");

// If the build didn't produce a standalone folder we have nothing to do —
// either the config got flipped or the build failed earlier. Either way,
// don't make it worse.
if (!fs.existsSync(STANDALONE)) {
  console.log("[postbuild] .next/standalone not found — skipping asset copy.");
  process.exit(0);
}

function copyRecursive(src, dst) {
  if (!fs.existsSync(src)) return false;
  fs.rmSync(dst, { recursive: true, force: true });
  fs.cpSync(src, dst, { recursive: true });
  return true;
}

const copies = [
  { src: path.join(ROOT, ".next", "static"), dst: path.join(STANDALONE, ".next", "static"), label: ".next/static" },
  { src: path.join(ROOT, "public"),           dst: path.join(STANDALONE, "public"),          label: "public/" },
];

for (const c of copies) {
  const ok = copyRecursive(c.src, c.dst);
  console.log(`[postbuild] ${ok ? "copied" : "skipped (missing)"}: ${c.label}`);
}

// Forward .env.production verbatim if it exists. Don't fail the build if it
// doesn't — many envs use a real .env or rely on platform-injected vars.
const envSrc = path.join(ROOT, ".env.production");
const envDst = path.join(STANDALONE, ".env.production");
if (fs.existsSync(envSrc)) {
  fs.copyFileSync(envSrc, envDst);
  console.log("[postbuild] copied: .env.production");
} else {
  console.log("[postbuild] no .env.production at project root — skipping.");
}

console.log("[postbuild] standalone bundle ready.");
