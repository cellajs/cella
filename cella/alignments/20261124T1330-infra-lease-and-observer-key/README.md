---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: SCW_OBSERVER_ACCESS_KEY, SCW_OBSERVER_SECRET_KEY, observerKeyInModeFile, writeObserverKey, gitKeyOptions, releaseLock, renewLock, INFRA_DEBUG, test:integration, STAGING_HOST, protect
---

# Infra: a lease per holder, one observer key file, a protected database

The lease tells two holders under one owner apart, this machine's observer key lives in `~/.config/<app>/observer.env`,
and the database instance and its database are protected. An app with scripts of its own in `infra/` follows the
changed `releaseLock`, `renewLock`, `gitKeyEnv` and observer key helpers. Every other app does nothing: the CLI moves
the key by itself, and the next apply sets the protection.

## What & why

Two sessions of one person could renew and release each other's lease, and a lease past its own end still read as
held: a lock now carries a `token`, and `lost` is true once its end passed. The observer key leaves every checkout's
`infra/.env.<mode>` for one file a machine. A replace of the database deleted it before a successor existed, after one
yes: `protect` now fails that plan.

## Blast radius

Every app with an environment. No database, cache or lens change. An app that added no script or resource to `infra/`
has no step. An older engine and this CLI read each other's leases.

## Run

No script: manual.

## Manual steps

1. No step for the observer key: at its first run in a checkout the CLI moves the key from `infra/.env.<mode>` to `~/.config/<app>/observer.env` and says so. When it names a second key, delete that key in the console (IAM → Applications → `<app>-observer` → API keys).
2. Not caught by the compiler. An app script that reads `SCW_OBSERVER_ACCESS_KEY` from `infra/.env.<mode>` reads `storedObserverKey(appSlug)` of `infra/lib/utils/env-files.ts`.
3. Caught by the compiler. `releaseLock` and `renewLock` take `{ owner, token }` where they took the owner; `gitKeyOptions(key)` is `gitKeyEnv(key)`, spread into the child's `env`; `OwnerKey.release()` is gone, drop the call; `writeObserverKey` takes the app slug and the key; `observerKeyInModeFile` is gone.
4. No step for the database: each environment's next apply protects the instance and its database, and replaces nothing. To replace one on purpose, run `pulumi state unprotect <urn>` before the apply. A teardown lifts the protection itself.
5. Caught by tests. An app resource in `infra/resources/` sets no `protect`: `tests/unit/resource-contracts.test.ts` admits it in `stores/postgres-managed.ts` alone.
6. Not caught by the compiler. `INFRA_DEBUG=true` is read no more: the stack trace of a failure an action did not expect is kept under `infra/.debug/`, and its line names the file. `pnpm --filter infra test:integration` and the port scan behind `STAGING_HOST` are gone.
7. No step: a key with under 30 minutes of life is refused at the Operator key and Owner key prompts, and a Scaleway call answered 429, 502, 503 or 504 is sent again, a POST only on 429.

## Verify

```sh
pnpm --filter infra exec vitest run
pnpm check
```
