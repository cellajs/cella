---
breaking: false
clientCacheBump: false
grep: getValidProduct, getValidChannel
---

# Single-entity routes send ETags and honor If-Match

A route at `/{<entity>Id}` of a channel or product now answers `GET` and `PATCH` with a strong `ETag`, answers
`If-None-Match` with 304 and a stale `If-Match` with 412 `precondition_failed`, all from `createXRoute`. An app's own
entity routes get this without code; an app closes the gap between check and write by adding
`preconditionWhere(ctx, <table>)` to the WHERE of each single-entity update query and `assertNoWriteBetween` after it.

## What & why

REST callers doing read-modify-write had no guard against lost updates (AEP-154). `createXRoute` detects a route for
one channel or product from its id param, and `getValidProduct` and `getValidChannel` check the preconditions on the
row they read. The tag hashes the entity type, id and `updatedAt`. `preconditionWhere` keeps the update on the checked
version; `assertNoWriteBetween` answers 412 when a write landed in between.

## Blast radius

Apps with their own channels or products. Not breaking: the browser client sends neither header, and a request without
them behaves as before. In tests, such a route whose 200 is not the entity, or whose write ignores `If-Match`, answers
500 naming the fix. No database change, no cache bump.

## Run

No script: manual.

## Manual steps

1. In each app update query copied from `updateAttachment` or `updateOrganization`, add `preconditionWhere(ctx, <table>)` to the WHERE.
2. In its operation, after the update: `if (!updated) assertNoWriteBetween(ctx, '<entity>')`.
3. A route at `/{<entity>Id}` whose operation reads its row another way than `getValidProduct` or `getValidChannel`: read it through one of them.

## Verify

```sh
pnpm sdk
pnpm --filter backend test
pnpm check
```
