/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Produce a self-contained .next/standalone/ folder that the VPS can run
  // without copying node_modules. Shrinks the deployed artifact by ~80%
  // and lets PM2 start the server directly: `node .next/standalone/server.js`.
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["@napi-rs/canvas"],
  },
};

module.exports = nextConfig;
