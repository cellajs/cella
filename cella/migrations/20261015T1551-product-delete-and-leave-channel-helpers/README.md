---
syncBreaking: false
clientCacheBump: false
---

# Product delete prepare and channel leave come as helpers

Replace the delete `prepare` copied into each product's `query.ts` with `prepareProductDelete` from
`~/query/offline/prepare-delete`, and a leave-channel mutation copied from `LeaveChannelButton` with `useLeaveChannel`
from `~/modules/memberships/use-leave-channel`.

## What & why

Every product module carried a copy of the attachment's delete `prepare`: cancel the queued create of a row deleted
before it reached the server, drop its queued updates and its list and detail cache entries, send the rest.
`prepareProductDelete` is that step. `useLeaveChannel` is the mutation behind `LeaveChannelButton`, with its offline
warning and membership refresh, for an app that renders its own leave control.

## Blast radius

Apps with product modules or leave controls of their own. Not sync-breaking: copies keep working. A leave copy without
`invalidateMemberships()` or the offline check misses both; switching to the hook adds them. No database or cache
change.

## Run

No script: manual.

## Manual steps

1. In each product's `query.ts`, replace the body of the delete hook's `prepare` with `prepareProductDelete(queryClient, keys, keys.list.org(organizationId), rows, (remaining) => ({ tenantId, organizationId, rows: remaining, stx: createStxForDelete() }))`, where `keys` is the module's `createEntityKeys` result; drop the imports it no longer uses (`removePausedCreates`, `removeDetailQueriesById`, ...).
2. Where the app calls `deleteMyMembership` to leave a channel, use `const { leave, isPending } = useLeaveChannel(channel, { redirectPath, callback })` and call `leave()`. `redirectPath: null` stays on the page; cache edits of the app's own go in `callback`.
3. `frontend/src/modules/attachment/query.ts` shows step 1 in place.

## Verify

```sh
pnpm --filter frontend ts
pnpm exec vitest run --project=frontend frontend/src/modules
pnpm check
```
