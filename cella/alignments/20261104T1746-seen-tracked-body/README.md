---
breaking: false
clientCacheBump: true
grep: isTrackedProductType, groupingChannelTypes, tracked-products
---

# Seen marks take tracked types only

The mark-seen body's `entityType` is `z.enum(appConfig.seenTrackedProductTypes)`, so a POST naming an untracked product answers 400 where it answered 200 with `newCount: 0`. `isSeenTracked` and `seenGroupingChannelTypes` move to `shared`; `backend/src/modules/seen/helpers/tracked-products.ts` is deleted. Bump `clientCacheVersion` in the app's own config.

## What & why

The client filtered marks with a boolean `isSeenTracked` behind a cast, and the server re-filtered with its own guard. One `isSeenTracked(type): type is SeenTrackedProductType` in `shared` serves both ends: past the seen store's guard a batch, and the body, name a tracked type, and `markSeenOp` takes `SeenTrackedProductType` without a guard. `SeenMark` and `SeenMeta` keep `ProductEntityType`, so the template's attachments table still marks attachments where an app does not track them.

## Blast radius

The apps' own `SeenMark`s pass tracked literals and compile unchanged; the files that imported the old guards are template files. A test whose `vi.mock('shared')` declares its own `seenTrackedProductTypes` overrides `isSeenTracked` too. Bumps `clientCacheVersion`; no database or lens change.

## Run

No script: manual.

## Manual steps

1. Bump `clientCacheVersion` in `shared/config/config.default.ts`.
2. An own module that imported `isTrackedProductType` or `groupingChannelTypes` from `#/modules/seen/helpers/tracked-products`, or `isSeenTracked` or `seenGroupingChannelTypes` from `~/modules/seen/helpers`, imports `isSeenTracked` or `seenGroupingChannelTypes` from `shared`.
3. An own test whose `vi.mock('shared')` sets `appConfig.seenTrackedProductTypes` adds `isSeenTracked` to the mock, as `frontend/src/query/realtime/channel-deleted.test.ts` does.

## Verify

```sh
pnpm sdk
pnpm check
```
