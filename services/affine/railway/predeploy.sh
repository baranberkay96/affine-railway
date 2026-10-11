#!/bin/sh
# Railway pre-deploy step: write config, wait for Postgres/Redis/indexer, then
# run AFFiNE's own self-host migration script (Prisma schema + data migrations).
set -eu
cd /app
node /app/railway/prepare.mjs
node /app/railway/wait.mjs
node /app/railway/bucket-cors.mjs
exec node ./scripts/self-host-predeploy.js
