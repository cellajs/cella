---
syncBreaking: true
clientCacheBump: false
---

# Actors registers as a module

Add `import '#/modules/actors/actors-module';` to the app-owned `backend/src/modules.ts`, after the activities import.

## What & why

`backend/src/modules/actors/` gets an `actors-module.ts` with no routes, like `activities`, and `core/openapi-tag-registry.ts`
drops its hand-registered `actors` tag. The module registration now creates that tag, which `ActorRef` sits under in the
docs.

## Blast radius

Every app: `modules.ts` is pinned, so its copy never gains the import. `modules.test.ts` fails until it does. No database,
lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Add `import '#/modules/actors/actors-module';` to `backend/src/modules.ts`.

## Verify

```sh
pnpm check
```
