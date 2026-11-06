---
breaking: true
clientCacheBump: false
caughtBy: tests
grep: getValidProduct, getValidChannel, assertNoWriteBetween
---

# Single-entity routes send ETags and honor If-Match

A route at `/{<entity>Id}` of a channel or product now answers `GET` and `PATCH` with a strong `ETag`, answers
`If-None-Match` with 304 and a stale `If-Match` with 412 `precondition_failed`, all from `createXRoute`. An app's own
entity routes get this without code; an app closes the gap between check and write by adding
`preconditionWhere(ctx, <table>)` to the WHERE of each single-entity update query and
`assertNoWriteBetween(ctx, '<entity>', id)` after it. In tests, a `GET` or `PATCH` at `/{<entity>Id}` whose 200 is
not the entity answers 500, so an app makes it answer the entity or moves it to a custom method.

## What & why

REST callers doing read-modify-write had no guard against lost updates (AEP-154). `createXRoute` detects a route for
one channel or product from its id param, and `getValidProduct` and `getValidChannel` check the preconditions on the
row they read. The tag hashes the entity type, id and `updatedAt`. `preconditionWhere` keeps the update of that row
on the checked version, and matches no row when no read checked `If-Match`; `assertNoWriteBetween` then answers 412.

## Blast radius

Apps with their own channels or products. Breaking in tests: such a route whose 200 is not the entity, or whose write
ignores `If-Match`, answers 500 naming the fix, and the inherited conditional-writes test walks every one. The browser
client sends neither header. No database change, no cache bump.

## Run

No script: manual.

## Manual steps

1. In each app update query copied from `updateAttachment` or `updateOrganization`, add `preconditionWhere(ctx, <table>)` to the WHERE.
2. In its operation, after the update: `if (!updated) assertNoWriteBetween(ctx, '<entity>', id)`, with the id of the row the update targeted.
3. A route at `/{<entity>Id}` whose operation reads its row another way than `getValidProduct` or `getValidChannel`: read it through one of them.
4. A `GET` or `PATCH` at `/{<entity>Id}` that answers something other than the entity (with `entityType`, `id` and `updatedAt` at the top level): answer the entity, or move the route to a custom method (`GET …/{<entity>Id}:<verb>`), which carries no tag.
5. A write route the conditional-writes test cannot reach with a stale `If-Match` (its answer is a 400): give its request body an example that validates.

## Verify

```sh
pnpm sdk
pnpm --filter backend test
pnpm check
```
