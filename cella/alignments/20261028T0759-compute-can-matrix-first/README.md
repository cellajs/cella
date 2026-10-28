---
syncBreaking: true
clientCacheBump: false
caughtBy: compiler
---

# computeCan takes the policy matrix first

`computeCan(channelType, grants, policies, overrides?)` is now `computeCan(policies, channelType, grants, overrides?)`.
App code that calls it moves the matrix to the front.

## What & why

The rest of the permission engine (`getAllDecisions`, `getDecisionsForAccesses`, `buildPolicyIndex`,
`getEntityPolicies`) already takes the matrix first, then what it looks up in it; `computeCan` was the one left.

## Blast radius

App-owned calls of `computeCan`, which typecheck flags (a `PolicyMatrix` where a channel type is expected). No database,
lens or `clientCacheVersion` change. Known sites, projectcampus `frontend/src/modules/`: `channel-tile/use-reads-product.ts`,
`channel-tile/can-post-items.test.ts`, `item/helpers/item-moderation.ts`, `item/tests/item-moderation.test.ts` (4 calls),
`item/tests/item-row-rights.test.ts` (2), `material/tests/material-rights.test.ts` (3). raak has none.

## Run

No script: manual.

## Manual steps

1. Rewrite each app-owned `computeCan(channelType, grants, policyMatrix)` as `computeCan(policyMatrix, channelType, grants)`.
2. A test stub of `computeCan` (a `vi.mock('shared')` factory) takes the matrix as its first parameter.

## Verify

```sh
pnpm check
```
