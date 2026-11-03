---
breaking: true
clientCacheBump: true
caughtBy: compiler
grep: clientCacheVersion, declareSyncView, RegisteredSyncView, truePath, selfFrontiers, frontierNodeKeys, mirrorChannelPaths, frontiers, e:f:h:
generate: true
---

# Catchup answers one view per organization and type

A catchup view is `{ organizationId, entityType, cursor }` and its answer `{ organizationId, entityType, status, frontier? }`. The client derives no grant-boundary views: `views.ts`, the sync store's `views`, `declareSyncView`, `removeSyncView`, `setViewCursor` and `getView` are gone. `resolveViewReadStatus` takes no prefix, depth or path. The worker keeps no `channel_counters.path`, no home frontier (`e:f:h:`) and a frontier on the organization's row only, so `frontierNodeKeys` and `mirrorChannelPaths` are gone.

## What & why

A registered view never fetched a range: its answer only refetched the organization's lists that the opaque organization view refetches at every catchup, so a project member's lists loaded twice per catchup. Behind it sat multi-prefix, self-depth and verified-path answers, the worker's copy of channel paths, a home frontier and frontiers on every channel row, read by nothing else.

## Blast radius

App code or tests that build catchup views with `key`, `prefixes`, `entityTypes` or `depth`, or read `frontiers`. One migration drops a column. A tab on the old bundle fails every catchup until it reloads. The breaking spec diff moves `clientCacheVersion`.

## Run

No script: manual.

## Manual steps

1. If `shared/config` sets its own `clientCacheVersion`, change its value.
2. Run `pnpm generate`: it alone writes the migration, one `ALTER TABLE "channel_counters" DROP COLUMN "path"`. No rename question arises, so it takes no hint.
3. App code or a test that posts a catchup view sends `{ organizationId, entityType, cursor }`, and one that reads an answer reads `organizationId`, `entityType` and `frontier`.
4. An app test that seeds `channel_counters` drops `path`, and one that asserts an `e:f:h:` key or an `e:f:` key on a channel below the organization drops that assertion.

## Verify

```sh
pnpm generate
pnpm check
```
