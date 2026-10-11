# Deploy and Host AFFiNE with Railway

AFFiNE is an open-source workspace that combines docs, whiteboards and databases on one canvas. This community template runs the AFFiNE 0.27 self-hosted server on Railway with PostgreSQL (pgvector), Redis, a Manticore search indexer and a Railway Bucket for files, and creates your administrator account on first start.

## About Hosting AFFiNE

AFFiNE's server is a Node.js application that stores documents in PostgreSQL, uses Redis for real-time sync and background jobs, and keeps uploaded images and attachments in a file store. Since version 0.27 most settings live in a `config.json` file; this template generates it from Railway variables on every start, so files go to a Railway Bucket and no manual configuration is needed. Database migrations run in Railway's pre-deploy step. A stable server key is derived from a generated secret, so sessions and stored secrets survive redeploys. The Manticore indexer adds server-side full-text search, and AI features work with your own provider key.

## Common Use Cases

- Team knowledge base and wiki that replaces Notion, with data on your own infrastructure.
- Whiteboards and diagrams next to the documents they belong to, like Miro inside your docs.
- Project planning with database views (tables, kanban) linked to pages.
- Personal or family notes synced across the desktop, mobile and web apps.

## Dependencies for AFFiNE Hosting

- AFFiNE self-hosted server (`ghcr.io/toeverything/affine`)
- PostgreSQL 16 with pgvector
- Redis
- Manticore Search (indexer)
- S3-compatible storage (Railway Bucket)
- Optional: SMTP server for invitations and password resets (Railway Pro plan), AI provider key

### Deployment Dependencies

- AFFiNE self-hosting documentation: https://docs.affine.pro/self-host-affine
- Configuration (`config.json`): https://docs.affine.pro/self-host-affine/install/configuration
- Indexer setup: https://docs.affine.pro/self-host-affine/administer/indexer
- AFFiNE releases: https://github.com/toeverything/AFFiNE/releases
- AFFiNE pricing and self-hosted plans: https://affine.pro/pricing
- Railway Buckets: https://docs.railway.com/storage-buckets

### Implementation Details

| Service | Image | Role | Public |
|---|---|---|---|
| `AFFiNE` | `ghcr.io/toeverything/affine:0.27.4` + start scripts | Web app, API, real-time sync; migrations in pre-deploy | HTTPS domain |
| `Indexer` | `manticoresearch/manticore:10.1.0` | Full-text search | — |
| `Postgres` | `pgvector/pgvector:0.8.7-pg16` | Documents, users, AI embeddings | — |
| `Redis` | `redis:8.2` | Sync, cache, job queues | — |
| `Bucket` | Railway Bucket | Images, attachments, AI files | — |

**First login.** Enter your email in `AFFINE_ADMIN_EMAIL` when deploying. After the first deploy, sign in with that email and the generated `AFFINE_ADMIN_PASSWORD` from the service variables, then change the password. The admin panel is at `/admin`.

**Adding people.** Sign-up is closed by default. Open it in Admin → Settings, or create accounts in Admin → Accounts. Invitation and password-reset emails need SMTP (`MAILER_HOST`, `MAILER_PORT`, `MAILER_USER`, `MAILER_PASSWORD`, `MAILER_SENDER`), which Railway allows on the Pro plan.

**AI.** AI is enabled with bring-your-own-key: workspace owners add a provider key under Workspace Settings → Integrations.

**Apps.** In the AFFiNE desktop or mobile app, add a self-hosted server with your Railway domain.

**Custom domain.** Update `AFFINE_SERVER_HOST` and `AFFINE_SERVER_EXTERNAL_URL` and redeploy.

**Licensing.** AFFiNE states that self-hosting is free for up to 10 seats per workspace; larger teams need AFFiNE's self-hosted Team plan. Check AFFiNE's pricing page for current terms.

**Scaling.** AFFiNE runs as one server process; give the service more memory and CPU as your team grows. Files scale with the Bucket.

**Pinning and upgrades.** The version is the `FROM` line in `services/affine/Dockerfile`. Change it after reading the release notes and push; migrations run before the new version starts. Desktop and mobile apps must be on a compatible version.

### Why Deploy AFFiNE on Railway?

Railway runs AFFiNE with its database, cache, search engine and file storage on a private network with automatic HTTPS, so your team gets a self-hosted Notion and Miro alternative in one deploy. You own the data, files scale in a low-cost Bucket, and you pay for the resources you use.
