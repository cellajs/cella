# Secrets scoped to their consumers; a sturdier Yjs relay

## What & why

Each runtime secret lives in a folder named by its consumer set, and a VM principal reads only its own folders
(`principalSecretCondition`). Mode-bound secrets are optional in the env schema and read through `modeSecret()`
(`env-mode-secrets.ts`). The relay refuses undecodable updates (4400), survives connection resets during the upgrade,
keeps updates through cleanup, and relays presence only for a socket's own clients. The editor turns read-only when
collaboration stops for good.

## Blast radius

Sync-breaking for apps with their own infra, runtime secrets or relay code. Needs a privileged infra `Apply`. Adds a
side-effect backfill of channel paths.

## Run

No script: manual.

## Manual steps

1. Drop `mcp` from the CDC, Yjs signing key, relay and admin-email entries of `runtime-secrets.config.ts`.
2. Read mode-bound secrets with `modeSecret()`; list app ones in `env-mode-secrets.ts`.
3. Run the privileged infra `Apply`; check the preview moves secret paths and replaces nothing.
4. Remove the public `/yjs/materialize` 503 bridge in the next release.

## Verify

```sh
pnpm --filter infra exec vitest run
TEST_MODE=full pnpm vitest run --project=yjs
pnpm check
```
