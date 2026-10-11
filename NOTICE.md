# NOTICE — AFFiNE template

This is a community template. It is not affiliated with or endorsed by TOEVERYTHING PTE. LTD. (AFFiNE). "AFFiNE" is a trademark of its owner.

## Upstream sources checked (2026-10-11)

| Source | Version / path | License | Use |
|---|---|---|---|
| toeverything/AFFiNE | `v0.27.4`: `.docker/selfhost/compose.yml`, `config.json.example`, `schema.json` | MIT (repository files outside `packages/backend`) | Topology (server + migration job + pgvector Postgres + Redis), config.json format |
| toeverything/AFFiNE | `v0.27.4`: `.render/start.sh`, `render.yaml` | MIT | Health path `/info`, start sequence idea |
| toeverything/AFFiNE | `v0.27.4`: `packages/backend/server/src/{prelude,env}.ts`, `base/config/register.ts`, `base/redis/config.ts`, `base/helpers/crypto.ts`, `core/config/service.ts`, `core/selfhost/controller.ts`, `core/workspaces/controller.ts`, `core/storage/wrappers/*.ts`, `plugins/copilot/storage.ts`, `scripts/self-host-predeploy.js`, `packages/backend/native/src/runtime/object_storage/*.rs` | AFFiNE EE licence (parts distributed as AFFiNE CE: MPL-2.0) | Read only, to learn configuration keys, key loading, setup endpoint, redirect/presign and avatar behaviour. Nothing copied. |
| toeverything/AFFiNE | `LICENSE`, `packages/backend/server/LICENSE` | — | Licensing note |
| docs.affine.pro | Configuration, Indexer (Manticore `10.1.0`) | — | config.json usage, indexer service |
| affine.pro | Enterprise / pricing pages | — | Self-hosting seat note |
| Railway docs | Storage Buckets | — | Bucket variables and URL style |

## Market templates reviewed

| Code | License | Use |
|---|---|---|
| `affine-notion-alternative` (base) | n/a (image-based) | Service layout and pre-deploy idea; nothing copied |
| `affine-selfhost` | n/a (image-based) | Reviewed only |
| `affine` | n/a (image-based) | Reviewed only |

## Own prior work reused

The Bucket CORS approach follows this project's round-1 Plane template (`templates/04-plane`, `bucket-cors` job); here it is implemented in Node without the AWS CLI.

## Railway base services

`Redis` copied from `templates/_railway-base/redis.json`; `Postgres` variables and volume from `templates/_railway-base/postgres.json` with the image changed to `pgvector/pgvector:0.8.7-pg16` and `SSL_CERT_DAYS` removed.

## Runtime images

- `ghcr.io/toeverything/affine:0.27.4` — AFFiNE self-hosted server (AFFiNE Community Edition; backend under the AFFiNE EE licence terms described above).
- `manticoresearch/manticore:10.1.0` — GPL-3.0.
- `pgvector/pgvector:0.8.7-pg16` (PostgreSQL License), `redis:8.2`.

All files in `template/` (Dockerfile, Node scripts, documentation) were written for this template.
