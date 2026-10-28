---
breaking: false
clientCacheBump: false
grep: restrict_by_org
---

# A full quota answers 403

Change `new AppError(429, 'restrict_by_org', ...)` in product modules copied from the attachment create to 403.

## What & why

The attachment create answered a full tenant quota with 429, which the API documents as a rate limit to retry after
`Retry-After`. It answers 403 `restrict_by_org`, as the member quota does: a quota is the tenant's policy, and waiting
does not lift it.

## Blast radius

Apps with a product module copied from the attachment module. An app that copied nothing gets the change with the
upgrade. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. `grep -rn "AppError(429, 'restrict_by_org'" backend/src`: change each match to 403.

## Verify

```sh
pnpm check
```
