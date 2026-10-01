# Guard caches without broadcast, memberships versioned

## What & why

`listenForAuthInvalidation`, the `auth_invalidate` channel and the `authInvalidation` health component are gone. Memberships are cached under `actors.bindings_version`, which the `memberships_bump_bindings_version` trigger replaces on every write. Sessions are cached 10 seconds; the writer and CDC (API process) drop them. Grants and the keys behind service tokens are read per request. `invalidateCache.*` clears this process only: no `db` argument, synchronous.

## Blast radius

Sync-breaking for apps with their own `invalidateCache`, `loadMemberships`, `dropCachedAuth`, `publishAuthInvalidation` or listener calls; TypeScript reports each one. One schema migration and one trigger. No `clientCacheVersion` bump; `/health?depth=full` loses `authInvalidation`.

## Run

No script: manual.

## Manual steps

1. `pnpm --filter backend generate` emits the `actors.bindings_version` column and a side-effect set with the `memberships_bump_bindings_version` trigger; commit both. An app that drops the `10-membership-rules` producer adds `bumpBindingsVersionSQL()` to its own.
2. In every `invalidateCache.*` call drop the `db` argument and the `await`, and move a call made inside a transaction to after it: `invalidateCache.user(userId)`, `.org(tenantId, orgId)`, `.tenant(tenantId)`, `.serviceAccount(account)`, and `.grant(accountId, grantId)` for a deleted grant. Keep the `.user` calls after membership writes: they drop the user's cached session in this process.
3. Replace `dropCachedAuth({ user })` with `dropCachedSessions(userId)` from `middlewares/guard/session-cache` and delete `publishAuthInvalidation` calls, an app's own copy of `revokeSessions` (`endSessions`) included.
4. Remove `listenForAuthInvalidation()` from app entry points, `authInvalidationHealth()` from app health builders and `'authInvalidation'` from app status entries.
5. Import `loadMemberships` from `middlewares/guard/membership-cache` (the module `auth-cache` is gone) and pass the request's version, `loadMemberships(userId, bindingsVersion)`, with `bindingsVersion` from `resolveSession`. `SessionCacheEntry` is `ResolvedSession` in `session.ts`.
6. Tests that waited for `auth_invalidate` messages assert the next request. A test that writes membership or role rows directly calls `invalidateCache.user(userId)` or emits the CDC activity on `activityBus`, as `tests/security/outside-writes.test.ts` does.

## Verify

```sh
pnpm --filter backend generate   # a second run reports no changes
pnpm --filter backend test
pnpm check
```
