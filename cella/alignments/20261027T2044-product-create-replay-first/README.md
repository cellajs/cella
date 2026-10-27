---
syncBreaking: true
clientCacheBump: false
caughtBy: nothing
grep: restrict_by_org, replayed ? 200 : 201, rejectedIds: [] as string[]
---

# Product creates check replays before the quota

The attachment create, the reference product create, now runs `checkIdempotency` before any quota check, refuses
through `assertTenantQuota`, lists every item it neither inserted nor found as the caller's live row in `rejectedIds`,
and answers 201 only when it inserted a row. App-owned product creates copied the old shape: follow
`backend/src/modules/attachment/operations/create-attachments.ts` and its handler.

## What & why

A replay of a batch larger than the tenant quota answered 403 although every row existed, the hand-written quota
check answered `restrict_by_org` without `meta` and refused system admins, and an item skipped by the insert
vanished from the answer. The `add-entity` skill documents the corrected order.

## Blast radius

App-owned product create operations and handlers (in the known apps: label, task, comment, item, material). The
compiler finds nothing: the old shape still builds. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. In each product create operation, drop the `input.length > quota` pre-check and run `checkIdempotency` first.
2. Replace the hand-written quota count and `restrict_by_org` refusal with `assertTenantQuota`.
3. Collect ids neither inserted nor committed meanwhile as the caller's live row into `rejectedIds`.
4. Return `created` from the operation and answer `created ? 201 : 200` in the handler.

## Verify

```sh
pnpm check
pnpm --filter backend test
```
