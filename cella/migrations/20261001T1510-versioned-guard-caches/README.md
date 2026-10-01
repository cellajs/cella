# Guard caches read per request, memberships versioned

## What & why

Sessions, grants and the keys behind service tokens are read at every request. Memberships are cached under `actors.bindings_version`, which the `memberships_bump_bindings_version` trigger replaces on every membership write. A change by any process, or outside the API, counts at the next request, so `listenForAuthInvalidation`, the `auth_invalidate` channel and the `authInvalidation` health component are gone. `invalidateCache.*` clears this process only: no `db` argument, synchronous.

## Blast radius

Sync-breaking for apps with their own `invalidateCache`, `loadMemberships`, `dropCachedAuth`, `publishAuthInvalidation` or listener calls; TypeScript reports each one. One schema migration and one trigger. No `clientCacheVersion` bump; `/health?depth=full` loses `authInvalidation`.

## Run

No script: manual.

## Manual steps

1. `pnpm --filter backend generate` emits the `actors.bindings_version` column and a side-effect set with the `memberships_bump_bindings_version` trigger; commit both. An app that drops the `10-membership-rules` producer adds `bumpBindingsVersionSQL()` to its own.
2. Delete `invalidateCache.user(...)` calls that only follow membership writes (an app's channel create, delete or join operations): the trigger covers every writer.
3. In the remaining calls drop the `db` argument and the `await`, and move a call made inside a transaction to after it: `invalidateCache.user(userId)`, `.org(tenantId, orgId)`, `.tenant(tenantId)`, `.serviceAccount(account)`, and `.grant(accountId, grantId)` for a deleted grant.
4. Delete `dropCachedAuth` and `publishAuthInvalidation` calls, an app's own copy of `revokeSessions` (`endSessions`) included: sessions are not cached.
5. Remove `listenForAuthInvalidation()` from app entry points, `authInvalidationHealth()` from app health builders and `'authInvalidation'` from app status entries.
6. Import `loadMemberships` from `middlewares/guard/membership-cache` (the module `auth-cache` is gone) and pass the request's version, `loadMemberships(userId, bindingsVersion)`, with `bindingsVersion` from `resolveSession`. `SessionCacheEntry` is `ResolvedSession` in `session.ts`.
7. Tests that waited for `auth_invalidate` messages assert the next request; a test that writes membership rows directly needs no cache call.

## Verify

```sh
pnpm --filter backend generate   # a second run reports no changes
pnpm --filter backend test
pnpm check
```
