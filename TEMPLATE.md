# AFFiNE 0.27 Docs and Whiteboards — composer spec

| Field | Value |
|---|---|
| Listing name | **AFFiNE 0.27 Docs and Whiteboards** (version label `0.27` = major.minor of a 0.x project; AFFiNE names releases without "v", e.g. "0.27.4"; image tag `0.27.4`) |
| Description | Docs, whiteboards and databases in one workspace you own. (57 chars) |
| Category | Other |
| Tags | affine, notion-alternative, miro-alternative, knowledge-base, whiteboard, docs |
| Base market template | `affine-notion-alternative` (25 projects, the most recent): official `ghcr.io/toeverything/affine:stable`, migrations as Railway pre-deploy (`self-host-predeploy.js`), pgvector Postgres, Redis, port 3010, `AFFINE_SERVER_EXTERNAL_URL` from the Railway domain. Kept: those. Fixed: floating `stable` tag, storage on a single volume, admin left to the first visitor, configuration through environment variables that AFFiNE 0.27 no longer reads for storage, pgvector on the public TCP proxy, no healthcheck. Also reviewed `affine-selfhost` (79 projects; `http://` external URL, variables for the old `.env` layout) and `affine` (284 projects; the retired `affine-graphql` image, Redis exposed through a TCP proxy, Bitnami Redis). |
| Upstream checked | AFFiNE `v0.27.4` (2026-08-18, latest stable; daily canaries ignored): `.docker/selfhost/compose.yml`, `config.json.example`, `schema.json`, `.render/start.sh` + `render.yaml`, server sources `src/prelude.ts`, `src/env.ts`, `base/config/register.ts`, `base/redis/config.ts`, `base/helpers/crypto.ts`, `core/config/service.ts`, `core/selfhost/controller.ts`, `core/workspaces/controller.ts`, `core/storage/wrappers/{avatar,blob}.ts`, `plugins/copilot/storage.ts`, native `runtime/object_storage/{config,service}.rs`, `scripts/self-host-predeploy.js`, `LICENSE` + `packages/backend/server/LICENSE`; docs pages Configuration and Indexer (Manticore `10.1.0`). Pinned 2026-10-11. |

## Architecture

```
 browsers, desktop & mobile apps ──HTTPS/WSS──► AFFiNE (:3010, all-in-one: GraphQL, sync, renderer, doc service)
        ▲                                     │  pre-deploy: prepare config → wait for deps → bucket CORS → migrations
        │ presigned GET (302 from AFFiNE)      ├──► Postgres 16 + pgvector (docs, users, AI embeddings)
        │                                     ├──► Redis (cache, BullMQ job queues, sync)
        └──────────── Railway Bucket ◄─────────┤──► Railway Bucket (workspace files, AI files; virtual-hosted S3)
                                              ├──► Indexer = Manticore Search 10.1.0 (server-side full-text search)
                                              └──► volume /root/.affine/storage (user avatars only)
```

### Configuration in 0.27

AFFiNE 0.27 reads its configuration from `~/.affine/config/config.json` (environment variables only for a few infrastructure settings: database, Redis, host/port/URL, indexer, mailer). `railway/prepare.mjs` writes `config.json` on every start and pre-deploy from Railway variables:

- `storages.blob.storage` and `copilot.storage` → provider `aws-s3` on the Railway Bucket (`endpoint` = `${{Bucket.ENDPOINT}}`, `region` `auto`, virtual-hosted addressing, credentials). Object keys are `<workspaceId>/<key>` and `<userId>/<workspaceId>/<key>`, so both share one Bucket without collisions.
- Avatars stay on the default `fs` provider: AFFiNE only serves `/api/avatars/` for `fs` storage (for S3 it links straight to the bucket, which is private on Railway). The small service volume at `/root/.affine/storage` keeps them across redeploys.
- `redis.ioredis.family = 0` (ioredis otherwise resolves IPv4 only), `auth.allowSignup` from `AFFINE_ALLOW_SIGNUP`, `copilot.enabled` + BYOK (upstream's example), `flags.allowGuestDemoWorkspace = false`.
- Values changed later in the admin panel (`/admin/settings`) are stored in Postgres and override `config.json` (verified in `core/config/service.ts`).

**Server key without a volume.** AFFiNE signs tokens and encrypts stored secrets (e.g. BYOK keys) with an EC private key that upstream generates into `~/.affine/config/private.key` on first pre-deploy. Railway's pre-deploy container cannot persist files, so `prepare.mjs` derives a P-256 key deterministically from the generated `AFFINE_PRIVATE_KEY_SEED` (SHA-256 → scalar mod n → PKCS#8 PEM) and writes it before AFFiNE starts; AFFiNE's `prelude.ts` loads it. Same seed → same key on every container and redeploy (verified: identical key hash across runs, session still valid after restart).

**Bucket CORS.** With S3 storage AFFiNE answers `GET /api/workspaces/:id/blobs/:key` with a 302 to a presigned Bucket URL, which the web app fetches with `fetch()`. The pre-deploy step `railway/bucket-cors.mjs` sets a CORS rule on the Bucket (`PutBucketCors`, SigV4 implemented with Node's crypto, no SDK) allowing GET/HEAD from `BUCKET_CORS_ORIGINS` (`*`: presigned URLs carry their own authorization; covers web, desktop and mobile clients). Best effort: failures are logged, never block the deploy. The round-1 Plane template applies the same kind of rule to a Railway Bucket successfully.

**First administrator.** AFFiNE redirects every page to `/admin/setup` until the first user exists. `railway/bootstrap-admin.mjs` runs next to the server, waits for `/info`, and calls AFFiNE's own `POST /api/setup/create-admin-user` with `AFFINE_ADMIN_EMAIL` / `AFFINE_ADMIN_PASSWORD` (accepted only while no user exists; "already created" is treated as success). If the email is empty it does nothing and the first visitor gets the setup page.

## Services

| Service | Source | Start / pre-deploy | Public | Healthcheck | Volume | Restart | Replicas |
|---|---|---|---|---|---|---|---|
| `AFFiNE` | repo `/services/affine` (FROM `ghcr.io/toeverything/affine:0.27.4`) | pre-deploy `/app/railway/predeploy.sh` (900 s): `prepare.mjs` → `wait.mjs` (Postgres, Redis, Indexer, up to 15 min) → `bucket-cors.mjs` → `scripts/self-host-predeploy.js` (Prisma + data migrations); start `/app/railway/start.sh` (image CMD) | domain → 3010 | `/info`, 300 s | `/root/.affine/storage` | ALWAYS | 1 |
| `Indexer` | image `manticoresearch/manticore:10.1.0` (AFFiNE's documented version) | image | — (private :9308) | `/`, 300 s | `/var/lib/manticore` | ON_FAILURE ×10 | 1 |
| `Postgres` | image `pgvector/pgvector:0.8.7-pg16` with Railway base variables (`SSL_CERT_DAYS` dropped) | image | — | — | `/var/lib/postgresql/data` | ON_FAILURE ×10 | 1 |
| `Redis` | `redis:8.2` (from `_railway-base/redis.json`) | base start command | — | — | `/data` | ON_FAILURE ×10 | 1 |
| `Bucket` | Railway Bucket | — | — | — | — | — | — |

pgvector is required: AFFiNE's Prisma schema uses the `vector` extension for AI embeddings. PostgreSQL 16 matches upstream's compose.

## Variables

**`AFFiNE`**

| Variable | Default | Notes |
|---|---|---|
| `PORT`, `AFFINE_SERVER_PORT` | `3010` | |
| `LISTEN_ADDR` | `::` | Node listener, dual-stack. |
| `AFFINE_SERVER_HOST`, `AFFINE_SERVER_HTTPS`, `AFFINE_SERVER_EXTERNAL_URL` | `${{RAILWAY_PUBLIC_DOMAIN}}`, `true`, `https://${{RAILWAY_PUBLIC_DOMAIN}}` | Change host and URL for a custom domain. |
| `AFFINE_SERVER_NAME` | `AFFiNE` | Shown in desktop/mobile apps. |
| `DATABASE_URL` | `postgresql://${{Postgres.PGUSER}}:${{Postgres.PGPASSWORD}}@${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/${{Postgres.PGDATABASE}}` | |
| `REDIS_SERVER_HOST/PORT/PASSWORD` | `${{Redis.RAILWAY_PRIVATE_DOMAIN}}`, `6379`, `${{Redis.REDIS_PASSWORD}}` | |
| `AFFINE_INDEXER_ENABLED`, `AFFINE_INDEXER_SEARCH_ENDPOINT` | `true`, `http://${{Indexer.RAILWAY_PRIVATE_DOMAIN}}:9308` | |
| `AFFINE_PRIVATE_KEY_SEED` | `${{secret(64, hex)}}` | Never change. `AFFINE_PRIVATE_KEY` (PEM) overrides it. |
| `AFFINE_ADMIN_EMAIL` | *(required input)* | First administrator. |
| `AFFINE_ADMIN_PASSWORD` | `${{secret(24)}}` | AFFiNE allows 8–32 characters. |
| `AFFINE_ALLOW_SIGNUP` | `false` | Default for open registration; admins can switch it in Admin → Settings → Auth. |
| `AFFINE_COPILOT_ENABLED` | `true` | AI with workspace-owner keys (BYOK). |
| `AFFINE_STORAGE` | `bucket` | `fs` keeps everything on the volume. |
| `BUCKET_NAME/ENDPOINT/REGION/ACCESS_KEY_ID/SECRET_ACCESS_KEY` | `${{Bucket.*}}` | |
| `BUCKET_FORCE_PATH_STYLE` | `false` | |
| `BUCKET_CORS_ENABLED`, `BUCKET_CORS_ORIGINS` | `true`, `*` | |
| `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` | `30` | |

**Optional email (SMTP only, Railway Pro plan):** `MAILER_HOST`, `MAILER_PORT` (465/587), `MAILER_USER`, `MAILER_PASSWORD`, `MAILER_SENDER` (`AFFiNE {noreply@your-domain}` style), `MAILER_IGNORE_TLS`. Needed for invitation and password-reset emails.

**`Indexer`**: `PORT=9308`; `searchd_threads=4` (Manticore's image maps `searchd_*` variables into its config; without it the thread count follows the host's CPU count).

**`Postgres` / `Redis`**: Railway base definitions (Postgres image swapped to pgvector).

## First start and accounts

1. Postgres, Redis and the Indexer start; the AFFiNE pre-deploy waits for them, sets the Bucket CORS rule and runs the migrations (≈1 min, creates the Manticore tables).
2. AFFiNE starts and creates the administrator from `AFFINE_ADMIN_EMAIL` + `AFFINE_ADMIN_PASSWORD` (log line `admin bootstrap: created administrator …`).
3. Sign in at the public domain, change the password, create a workspace. Admin panel: `/admin`.
4. Add users: enable sign-up in Admin → Settings, or create accounts in Admin → Accounts. Invitation emails need SMTP.
5. AI: Workspace Settings → Integrations → AI BYOK, add your provider key.
6. Desktop/mobile apps: add a server with the public URL.

## Composer steps (Railway dashboard)

1. Add `Redis` (`_railway-base/redis.json`), a Postgres service from `_railway-base/postgres.json` with image `pgvector/pgvector:0.8.7-pg16` (drop `SSL_CERT_DAYS`), and a Bucket named `Bucket`.
2. `Indexer`: image `manticoresearch/manticore:10.1.0`, volume `/var/lib/manticore`, healthcheck `/` (PORT 9308), variables above.
3. `AFFiNE`: repo `baranberkay96/affine-railway`, root `/services/affine`; pre-deploy `/app/railway/predeploy.sh` (timeout 900 s); healthcheck `/info` (300 s); domain → 3010; volume `/root/.affine/storage`; restart ALWAYS; variables above.

## Improvements over market templates

| Area | Market templates | This template |
|---|---|---|
| Image | `affine:stable` floating / retired `affine-graphql:stable` | `affine:0.27.4` pinned |
| Configuration | Environment variables only (storage variables ignored since 0.27) | `config.json` generated from Railway variables on every start; admin-panel changes still win |
| File storage | Single volume for everything | Workspace files and AI files in the Railway Bucket (no size cap, $0.015/GB), CORS rule set automatically; only avatars on a small volume |
| Server key | Generated by the pre-deploy container (not persisted on Railway → new key per deploy, sessions/encrypted secrets break) or kept on the volume | Derived from a generated seed: stable without storage, identical across replicas and redeploys |
| Admin | `affine-notion-alternative`: empty admin variables (no longer read); others: first visitor | Automatic administrator through AFFiNE's setup endpoint |
| Search | Indexer disabled | Manticore indexer (AFFiNE's documented setup) for server-side full-text search |
| Dependencies | Pre-deploy fails if Postgres is still starting | Pre-deploy waits up to 15 min for Postgres, Redis and Indexer |
| Network | pgvector/Redis exposed through public TCP proxies, `http://` external URL | Private network only, HTTPS external URL, IPv6-capable Redis client |
| Healthcheck | none | `/info` |
| Sign-up | Open by default | Closed by default (admin can open it) |

## Resource profile and cost (Railway: RAM $10/GB-mo, vCPU $20/mo, volume $0.15/GB-mo, bucket $0.015/GB-mo)

| Service | Idle RAM | Typical RAM | Idle CPU | Typical CPU |
|---|---|---|---|---|
| AFFiNE (all-in-one Node server) | 0.38 GB | 0.6–1.2 GB | 0.02 | 0.1–0.5 |
| Indexer (Manticore, multilingual morphology dictionaries) | 0.45 GB | 0.5–0.8 GB | 0.01 | 0.02–0.2 |
| Postgres (pgvector) | 0.05 GB | 0.15–0.4 GB | 0.01 | 0.03–0.15 |
| Redis | 0.01 GB | 0.02–0.05 GB | 0 | 0.01 |
| **Total** | **~0.9 GB** | **~1.3–2.5 GB** | **~0.04 vCPU** | **~0.15–0.85 vCPU** |

Measured locally after install and test uploads: AFFiNE 375 MiB, Indexer 455–680 MiB (the doc/block tables load Chinese, English, German and Russian lemmatizer dictionaries), Postgres 50 MiB, Redis 7 MiB.

Estimated monthly cost: **idle ≈ $10** (0.9 GB × $10 + 0.04 vCPU × $20 + ~1.5 GB volumes); **typical team (5–20 active editors) ≈ $17–40**; files in the Bucket at $0.015/GB. Dropping the Indexer saves ≈ $5/month (set `AFFINE_INDEXER_ENABLED=false`, then remove the service). Minimum plan: **Hobby**.

## Scaling

AFFiNE runs all flavors in one process. It keeps only avatars on its volume, so it stays at one replica; scale it vertically. Postgres holds the documents; Redis carries sync and job queues.

## Pinning and upgrades

Pinned 2026-10-11: `ghcr.io/toeverything/affine:0.27.4` (`services/affine/Dockerfile`), `manticoresearch/manticore:10.1.0`, `pgvector/pgvector:0.8.7-pg16`, `redis:8.2`. Upgrade AFFiNE by changing the `FROM` tag; the pre-deploy step runs Prisma and data migrations before the new version starts. Check AFFiNE's release notes for client/server compatibility (0.27 clients need a 0.27+ server) and rename the listing when the minor version changes.

## Verification checklist

- [ ] AFFiNE pre-deploy logs: `Postgres reachable`, `Redis reachable`, `Indexer reachable`, `bucket CORS: rule applied`, `Done … migrations`.
- [ ] AFFiNE logs: `storage runtime started: db=true provider=aws-s3`, `Listening on http://[::]:3010`, `admin bootstrap: created administrator {email}`.
- [ ] `/info` returns `{"compatibility":"0.27.4",…,"type":"selfhosted"}`; the healthcheck passes.
- [ ] Sign in with the admin email/password; `/admin` opens.
- [ ] Create a workspace, paste an image into a doc → it renders after a reload (302 to a presigned Bucket URL, CORS OK); the object appears in the Bucket under `{workspaceId}/`.
- [ ] Upload an avatar → it shows; redeploy → avatar, docs and images persist; you stay signed in.
- [ ] Search inside a workspace returns doc content (server-side indexer).
- [ ] Optional: add an AI provider key under BYOK and run an AI action.

## Local test (2026-10-11)

Built `services/affine` and ran it with `pgvector/pgvector:0.8.7-pg16`, Redis 8.2, Manticore 10.1.0 and a local S3 server standing in for the Bucket: pre-deploy waited for all three dependencies, applied the CORS rule and ran 10 data migrations (Manticore tables created); the server started with `provider=aws-s3`, the admin bootstrap created the administrator, `/info` returned 200 for any Host header. A 200 KB workspace blob was stored in the bucket as `{workspaceId}/blob.bin`, `GET /api/workspaces/{id}/blobs/blob.bin` returned 302 to a presigned URL (path-style locally, virtual-hosted on Railway) that answered 200 with `Access-Control-Allow-Origin`, and the bytes matched. An avatar landed in `/root/.affine/storage/avatars`. The derived key was identical across runs and the session survived a server restart. The SigV4 signing of `bucket-cors.mjs` was validated against an S3 server that checks signatures (correct key accepted, wrong key `SignatureDoesNotMatch`).

## Open questions

- Not deployed on Railway. The Bucket side uses AFFiNE's native S3 client with virtual-hosted URLs and region `auto`; confirm the first image upload and the CORS rule (`PutBucketCors`) on a real Railway Bucket.
- Licensing: AFFiNE's server code is under the AFFiNE EE licence except the parts distributed as AFFiNE Community Edition (MPL-2.0); AFFiNE's enterprise page states self-hosting is free for up to 10 seats per workspace and offers a paid self-hosted Team plan beyond that. The README points users to AFFiNE's pricing; confirm the current terms with AFFiNE before marketing larger deployments.
- The Indexer listens on IPv4 only (Manticore); legacy Railway environments with IPv6-only private networking would need `AFFINE_INDEXER_ENABLED=false`.
- Workspace blobs and AI files share one Bucket (non-overlapping key prefixes, verified in the 0.27.4 sources); a future AFFiNE release that sweeps whole buckets would need separate Buckets.
- `config.json` and the derived key are rewritten on every start; changes made only in `config.json` by hand are lost (use the admin panel or Railway variables).
