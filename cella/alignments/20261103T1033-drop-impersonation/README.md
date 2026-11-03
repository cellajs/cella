---
breaking: true
clientCacheBump: true
caughtBy: compiler
grep: impersonat, VenetianMaskIcon
generate: true
---

# Impersonation is gone

An app runs `pnpm generate` for the dropped `sessions.impersonator_session_id` column, ports `data.sql` into that
migration, and removes what the typecheck names: `startImpersonation`, `stopImpersonation`, `Me.impersonator`,
`ctx.var.impersonator`, the `impersonation` session type and cookie, the `impersonation_stopped` reason, the
`impersonation-started` mail and the locale keys under `impersonat`.

## What & why

A system admin's own access covers support work: the permission engine allows them every action and every page opens
for them without a membership. Impersonation was the one write path that stamped rows with someone else's actor.
`PERMISSIONS.md` "System admins" says what a system admin may do and how support reads a member's view.

## Blast radius

Every app: the column drop, the sdk and `clientCacheVersion`. No lens. App tests that insert a session of type
`impersonation` or call `createSession` with a fifth argument fail to typecheck.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`; paste `data.sql` (deletes the stored impersonation rows) above the drop statements it wrote.
2. Delete the app code, tests and `app.json` overrides the typecheck or `pnpm cella align` names.
3. An app that sets its own `clientCacheVersion` bumps it.

## Verify

```sh
pnpm generate
pnpm check
pnpm test
```
