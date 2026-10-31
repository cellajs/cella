---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: "optional: true"
---

# Modules have no optional flag

`ModuleConfig` no longer has `optional`, so `defineFrontendModule` and `defineBackendModule` refuse it. An app removes `optional: true` from its own module registrations, usually `frontend/src/modules/marketing/marketing-module.ts`.

## What & why

create-cella no longer offers modules to leave out when it creates an app. Deselecting one left its route files behind and broke the new app, so the prompt and `optional` in `shared/src/module-registry.ts` are gone. The marketing module is now always part of a new app.

## Blast radius

Apps that set `optional: true`, which is every app with the app-owned marketing module. Typecheck flags each one. No lens and no database change.

## Run

No script: manual.

## Manual steps

1. Remove `optional: true` from each `*-module.ts` that sets it.

## Verify

```sh
pnpm check
```
