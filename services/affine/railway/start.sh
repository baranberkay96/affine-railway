#!/bin/sh
# Railway start command: write config and server key, create the first admin in
# the background once the server answers, then run the AFFiNE server (all
# flavors: GraphQL API, sync, renderer, doc service) in the foreground.
set -eu
cd /app
node /app/railway/prepare.mjs
node /app/railway/bootstrap-admin.mjs &
exec node ./dist/main.js
