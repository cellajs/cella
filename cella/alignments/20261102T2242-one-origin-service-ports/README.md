---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: devPorts, frontendUrl, backendUrl, backendAuthUrl, yjsUrl, mcpUrl, oauthUrl, urlEnvNames, FRONTEND_URL, BACKEND_URL, MCP_URL, OAUTH_URL, MODE, modeSecret, env-mode-secrets, DB_PORT, DB_TEST_PORT, PROJECT_SLUG, mcp-worker, oauth-worker, jobs-worker, company.supportEmail, NODE_ENV=tunnel, NODE_ENV=staging
---

# One origin per mode, service ports on `services`, workers as a `SERVICE`

In `shared/config/config.default.ts` replace the six URL fields with `origin`, drop `mode`, move the `devPorts` numbers onto `services.<slug>.port` (the backend's `internalPort`), add `sandbox` to a federation with a test issuer, and let the mode files derive from the default as the template's do. Delete the `mcp/`, `oauth/` and `jobs/` packages, the database ports in `backend/.env`, and rename the process env `MODE` to `SERVICE` and `modeSecret` to `serviceSecret` in app code.

## What & why

Every service URL derives from one `origin` and `servicePaths`, so a mode file names one address, `APP_ORIGIN` is the only override and the passkey relying party is the origin's host (tunnel and staging had the apex). `services.<slug>.port` is the one port list: the Vite proxy, the folded workers and the registry read it. `PORT` defaults by `SERVICE`, so `pnpm dev` starts the workers from the backend package. The database ports follow `devAppIndex`.

## Blast radius

Every app: `shared/config` is ignored by the sync, `backend/.env` and the docs MDX are app-owned. No database or cache change. Passkeys registered under the apex domain stop matching the host-bound relying party; no app is in production yet.

## Run

No script: manual.

## Manual steps

1. `config.default.ts`: `origin: '<https://www.your.domain>'` replaces `frontendUrl`, `backendUrl`, `backendAuthUrl`, `yjsUrl`, `mcpUrl` and `oauthUrl`; delete `mode`; replace `devPorts` with the template's `services` block (`enabled` and `port` per service, `internalPort` on the backend), keeping the app's `enabled` flags; delete `company.supportEmail`; give a federation with a test issuer a `sandbox: { issuer, idpMetadataUrl }`. The `as boolean` casts and the `as const` on `defaultRestrictions` and `theme` may go: a mode file can now override any boolean or number.
2. Copy the template's five mode files over the app's, then put back only the app's own overrides (`has`, `services`, `s3`, `singleVM`): a mode file derives `name`, `slug` and `origin` from the default and names no URL, no `mode` and no federation.
3. `backend/.env`: delete `PROJECT_SLUG`, `DB_PORT`, `DB_TEST_PORT`, `NODE_ENV` and the three `DATABASE_*` lines, unless one points at another server than the compose containers.
4. Delete `mcp/`, `oauth/` and `jobs/` and their lines in `pnpm-workspace.yaml`; run `pnpm install`. An app script that ran `pnpm --filter mcp-worker dev` runs `pnpm --filter backend dev:mcp`.
5. App code: `appConfig.devPorts.api` is `appConfig.services.backend.port` (`internal` is `backend.internalPort`, `cdcHealth` is `cdc.port`); `env.MODE` is `env.SERVICE` and `modeSecret` is `serviceSecret` from `#/env`; a check that means "a stack on this machine" reads `appConfig.isLocal` or `isDeployed`; `urlEnvNames` is `originEnvName`; `appConfig.company.supportEmail` is `appConfig.supportEmail`.
6. An app script that set `NODE_ENV=tunnel` or `NODE_ENV=staging` sets `APP_MODE` instead and leaves `NODE_ENV` at `development`, `production` or `test`; `pnpm tunnel` now starts the whole stack.
7. `frontend/src/content/docs`: the MDX pages that imported `jobs/README.md`, `mcp/README.md` or `oauth/README.md` import `cella/JOBS.md`, `cella/MCP.md` or `cella/OAUTH.md`.
8. An app-owned `infra/config/services.config.ts` names its workers' env as `SERVICE: '<slug>'` and `APP_ORIGIN: '${APP_ORIGIN}'`, with no `PORT`, `*_URL` or port env; then `pnpm infra:compose` rewrites `infra/compose.gen.yml`.
9. Users of a staging or production stack register their passkeys again once deployed.

## Verify

```sh
pnpm check
pnpm --filter infra exec vitest run
pnpm docker && pnpm dev
```
