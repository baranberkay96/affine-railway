# AFFiNE for Railway: official self-host image + Railway start scripts.
#
# The scripts generate ~/.affine/config/config.json (Railway Bucket storage,
# Redis, AI/BYOK, sign-up policy) and a stable server key from Railway
# variables on every start, so the service needs no volume. Migrations run in
# Railway's pre-deploy step; the first admin is created through AFFiNE's own
# setup endpoint.
#
# The AFFiNE version is this FROM line. Clients 0.27+ need a 0.27+ server.
FROM ghcr.io/toeverything/affine:0.27.4

COPY --chmod=755 railway/ /app/railway/

RUN set -eux; \
    for f in /app/railway/*.mjs; do node --check "$f"; done; \
    sh -n /app/railway/start.sh; \
    sh -n /app/railway/predeploy.sh

ENV AFFINE_SERVER_PORT=3010 \
    PORT=3010

EXPOSE 3010
CMD ["/app/railway/start.sh"]
