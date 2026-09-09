#!/usr/bin/env bash
#
# One-command production deploy for the Sanfort International School CRM.
# Run this on the VPS from the project root:
#
#     ./deploy.sh
#
# What it does, in order:
#   1. Pulls the latest code from the main branch
#   2. Installs any new dependencies
#   3. Builds the Next.js production bundle (outputs .next/standalone)
#   4. Copies the static + public assets into the standalone folder so
#      `node .next/standalone/server.js` serves them correctly
#   5. Restarts the PM2 process (graceful — zero downtime if clustered)
#   6. Saves the PM2 process list so it auto-resurrects on reboot
#
# Exit codes:
#   0 — deploy succeeded
#   any non-zero — deploy aborted; previous version still running
#
# Idempotent: safe to re-run if a step fails partway through.

set -euo pipefail

APP_NAME="school-crm"

echo "==> [1/5] git pull"
git pull --ff-only

echo "==> [2/5] npm install"
npm install --no-audit --no-fund

echo "==> [3/5] next build"
npm run build

# Next.js 'standalone' output only copies the server.js + the minimal
# node_modules into .next/standalone. Static assets (.next/static, public/)
# must be copied alongside or every page 404s its CSS/JS.
echo "==> [4/5] copy static + public into standalone"
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
if [ -d "public" ]; then
  cp -r public .next/standalone/public
fi

echo "==> [5/5] pm2 restart"
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 reload "$APP_NAME" --update-env
else
  # First-time start. Binds to 127.0.0.1 so Nginx is the only public
  # entry point — direct hits to :3000 from the internet are blocked.
  pm2 start .next/standalone/server.js \
    --name "$APP_NAME" \
    --max-memory-restart 1500M \
    --time \
    -- \
    -H 127.0.0.1 -p 3000
fi

pm2 save

echo
echo "Deploy complete: $(date)"
echo "Tail logs with:  pm2 logs $APP_NAME"
