---
syncBreaking: true
clientCacheBump: false
---

# Auth token reads and writes move to tokens-queries

Token reads and writes move from token-lifecycle into tokens/tokens-queries. findLinkToken({ type,
rawToken }) becomes findLinkToken(ctx, { type, rawToken }) in tokens-queries;
withdrawLinkToken({ type, rawToken }) becomes deleteUnopenedLinkToken(ctx, { type, rawToken }).
findInvitationToken(ctx, key, { forUpdate }) becomes findInvitationToken(ctx, { ...key, forUpdate }).
spendCookieToken(ctx, type, { db: tx }) becomes spendCookieToken(ctx, type, { deleteCookie:
'after-commit', txCtx }). general/helpers/link-handlers moves to tokens/operations/open-link-token,
which exports openLinkToken(ctx, type, rawToken). Apps update imports and calls.

## What & why

`token-lifecycle` keeps the operations (`issueTokens`, `issueToken`, `issueCookieToken`, `invokeToken`, `readBoundToken`, `spendCookieToken`) and the request-marker cookies; every read and write is a query in `tokens-queries`. `spendCookieToken` deleted the cookie when its `db` option was the base pool; the explicit `deleteCookie` option says it now.

## Blast radius

Apps that call `findLinkToken`, `withdrawLinkToken`, `findInvitationToken` with `forUpdate`, `spendCookieToken` with a transaction, or import `linkHandlers`; TypeScript reports each call. No database change, no `clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. `findLinkToken` and `deleteUnopenedLinkToken` (was `withdrawLinkToken`) from `tokens/tokens-queries`, with a database context first: `{ var: { db: baseDb } }` where none is at hand.
2. `findInvitationToken(ctx, { id }, { forUpdate: true })` → `findInvitationToken(ctx, { id, forUpdate: true })`.
3. `spendCookieToken(ctx, type, { db: tx })` → `spendCookieToken(ctx, type, { deleteCookie: 'after-commit', txCtx: { var: { db: tx } } })`.
4. `linkHandlers[type](ctx, rawToken)` → `openLinkToken(ctx, type, rawToken)` from `tokens/operations/open-link-token`; an app's own link type adds its handler there.

## Verify

```sh
pnpm check
```
