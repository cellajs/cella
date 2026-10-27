---
syncBreaking: true
clientCacheBump: false
caughtBy: compiler
grep: getEntityPolicies
---

# The permission policy functions take the policy matrix first

`getEntityPolicies(entityType, policies)` is now `getEntityPolicies(policies, entityType)`, the order the rest of the
policy family uses. App code that calls it swaps the two arguments.

## What & why

The policy helpers in `shared/src/permissions` took their arguments in three orders; they now take the matrix first,
then what they look up in it, so a reader learns one shape.

## Blast radius

Sync-breaking for app-owned code that calls `getEntityPolicies` (typecheck flags each call). An app without such calls
has nothing to do. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Swap the arguments of each app-owned `getEntityPolicies(entityType, policies)` call to `getEntityPolicies(policies, entityType)`.

## Verify

```sh
pnpm check
```
