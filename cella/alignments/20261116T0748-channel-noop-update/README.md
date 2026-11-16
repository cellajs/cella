---
breaking: false
clientCacheBump: false
grep: getValidChannel, updateStamps, assertNoWriteBetween, filterNoOpFields
---

# A channel update that changes nothing writes nothing

An app's channel update operation passes the values it writes through `filterNoOpFields` with the locked row, and
when none is left returns that row after `assertPreconditionsChecked`, with no UPDATE, `updateStamps`,
`dispatchMutation` or cache invalidation.

## What & why

`updateOrganizationOp` wrote every sent field and `updateStamps` even when each equaled the stored value. An identical
PATCH moved the `ETag`, which refused the next write of a client holding the old tag with 412, and recorded an
activity naming an admin who changed nothing. `filterNoOpFields` now also compares arrays and objects by structure,
which `languageCodes` and the merged JSON columns need.

## Blast radius

Apps with channel update operations copied from organization's. Not breaking: an unaligned operation keeps writing at
today's cost. A product update whose array or object op equals the stored value now writes nothing too. No database,
lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. In each channel update operation copied from `update-organization.ts`, pass the values to write, merged patches included, through `filterNoOpFields(<locked row>, values)` and add `updateStamps` after it.
2. When no value is left, call `assertPreconditionsChecked(txCtx, '<name>')` and return the locked row with no update, `dispatchMutation`, cache invalidation or image release.
3. Read each operation for a side effect an identical PATCH must still trigger, and keep that side effect above the return.
4. A test that expects a write, an activity or a new `ETag` for an equal value, array or object expects none.

## Verify

```sh
pnpm check
```
