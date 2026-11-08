---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: backend/.env, loadBackendDotenv, envFlag, createEnv, t3-oss, TEST_SEND_EMAILS, TUNNEL_URL, VITE_DEBUG_UI, VITE_DEBUG_MODE, DEBUG_MODE, SINGLE_VM, ELEMENT_ROOM_ID, ELEMENT_BOT_ACCESS_TOKEN, matrixURL, sendMatrixMessage, DB_PORT, DB_TEST_PORT, DB_TESTBED_PORT, YJS_DB_POOL_MAX, INTERNAL_PORT, YJS_PORT, CDC_HEALTH_PORT, SCW_PROJECT_ID, SCW_ORGANIZATION_ID, appEnv
---

# One env file at the repo root, one validator, one name per variable

Move `backend/.env` to `.env` at the repo root. Rename `DB_PORT`, `DB_TEST_PORT`, `DB_TESTBED_PORT`, `YJS_DB_POOL_MAX`, `VITE_DEBUG_MODE`, and the Scaleway `SCW_PROJECT_ID` and `SCW_ORGANIZATION_ID` to their one remaining name, drop the port overrides, `TUNNEL_URL` and the Matrix keys, and set a `SYSTEM_ADMIN_IP_ALLOWLIST` that held `none` to `off`.

## What & why

Each process has one validated `env` module, built on `parseEnv` from `shared/utils/parse-env`. Backend tests now validate too and load no env file: `env` is a snapshot, so a test writing `process.env` after import no longer changes it. `@t3-oss/env-core` is gone, as is `loadBackendDotenv`, replaced by `loadRootEnv(import.meta.url)`. Config decides per environment, env per machine: ports come from config plus `DEV_PORT_OFFSET`.

## Blast radius

Every app. No database, cache or lens change. `caughtBy: nothing` because an env name a shell or file still sets is ignored without a sound, and a deployed `SYSTEM_ADMIN_IP_ALLOWLIST=none` now stops the boot. A deploy owes an apply.

## Run

No script: manual.

## Manual steps

1. `mv backend/.env .env`, and `.env.example` follows from the upgrade. `frontend/.env` stays.
2. In every env file, shell profile and CI secret, rename: `DB_PORT` to `DATABASE_PORT`, `DB_TEST_PORT` to `DATABASE_TEST_PORT`, `DB_TESTBED_PORT` to `DATABASE_TESTBED_PORT`, `YJS_DB_POOL_MAX` to `YJS_DATABASE_POOL_MAX`, `VITE_DEBUG_MODE` to `VITE_DEBUG` (in `frontend/.env`), `SCW_PROJECT_ID` to `SCW_DEFAULT_PROJECT_ID` and `SCW_ORGANIZATION_ID` to `SCW_DEFAULT_ORGANIZATION_ID`.
3. Delete what no longer reads: `PORT`, `INTERNAL_PORT`, `YJS_PORT`, `CDC_HEALTH_PORT` (config plus `DEV_PORT_OFFSET` moves them), `TUNNEL_URL`, `TEST_SEND_EMAILS`, `VITE_DEBUG_UI`, `SINGLE_VM`, `ELEMENT_ROOM_ID`, `ELEMENT_BOT_ACCESS_TOKEN`.
4. Lengthen a `COOKIE_SECRET` entry under 16 characters. Development no longer allows a short one.
5. A runtime secret or a `.env` with `SYSTEM_ADMIN_IP_ALLOWLIST=none` takes `off`, before the deploy: the old value fails validation and stops the boot.
6. `INFRA_DEBUG`, `INFRA_DEBUG_PROVIDER` and `INTEGRATION` now take `true`, not `1`.
7. App code: an env module of its own replaces `createEnv` with `parseEnv(schema, source)` and `loadBackendDotenv()` with `loadRootEnv(import.meta.url)`; `envFlag` moved to `shared/utils/parse-env`; a test writing `process.env` for a value `#/env` holds uses `overrideConfig(env, ...)`; `appConfig.matrixURL` and `sendMatrixMessage` are gone; `release.appEnv` left the service registry.
8. An app with a federation of its own adds its `SSO_<KEY>_CLIENT_ID` and `SSO_<KEY>_CLIENT_SECRET` pair to `infra/config/runtime-secrets.config.ts`.
9. Run `pnpm infra apply --mode <env>` before the release deploys: the description changed, and the old engine builds from the old example path.

## Verify

Run `pnpm check`, then `pnpm boot:check`. Read every hit of the `grep` terms in app-owned files by hand.
