---
syncBreaking: true
clientCacheBump: false
---

# The accessibility ledger and audit scope belong to the app

Add `json/accessibility-conformance.json` to `ignored` and `a11y/scope-config.ts` to `pinned` in the app's
`cella/cella.config.ts`, then list the app's own routes in `a11y/scope-config.ts`. `pnpm a11y:run` starts the audit's
own database and stack, and `pnpm style` now fails on color tokens below their contrast ratio and on a memo dependency
its callback never reads.

## What & why

The ledger is one product's results, and the audit's list of pages is one product's routes; both synced into every app.
The ledger now carries the root package name and another product's ledger is never read. The states moved from
`a11y/src/scope.ts` to `a11y/scope-config.ts`, with `placeholders` and `prepare` for app-specific setup. The audit
gained pixel-measured contrast probes and a one-command runner with a `db_a11y` service in `backend/compose.yaml`.

## Blast radius

Tooling only: `a11y/`, `shared/scripts`, `backend/compose.yaml`. Sync-breaking for an app whose config lacks the two
paths: its next sync would overwrite the ledger and the scope. No database change, no `clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. In `cella/cella.config.ts`: add `'json/accessibility-conformance.json'` to `ignored` and `'a11y/scope-config.ts'` to `pinned`.
2. In `a11y/scope-config.ts`: replace the template's states with the app's routes, add a resolver per `{name}` placeholder, and adapt `prepare`.
3. Delete a synced `json/accessibility-conformance.json` that holds the template's results; `pnpm a11y:run` writes the app's own.
4. Fix what `pnpm style` now reports: `token-contrast` in `frontend/src/styling/tailwind.css`, `memo-dependency-unread` in hooks.

## Verify

```sh
pnpm style
pnpm a11y:run
```
