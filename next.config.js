/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Build output directory. Defaults to .next, but two Next processes
  // cannot share one — they overwrite each other's chunks and the running
  // server starts 500ing with "Cannot find module './8948.js'". Set
  // NEXT_DIST_DIR to give a second dev server (a parallel agent, a
  // throwaway verification run) its own folder.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Produce a self-contained .next/standalone/ folder that the VPS can run
  // without copying node_modules. Shrinks the deployed artifact by ~80%
  // and lets PM2 start the server directly: `node .next/standalone/server.js`.
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["@napi-rs/canvas"],
  },
};

module.exports = nextConfig;
