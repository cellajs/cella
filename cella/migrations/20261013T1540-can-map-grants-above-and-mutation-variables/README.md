---
syncBreaking: true
clientCacheBump: false
---

# The `can` map counts the grants above a channel, and queued mutations carry one variables shape

`requireEntityAction` is async and must be awaited. `squashIntoPendingCreate` takes the keys a create row accepts as a
fifth argument. `CanState` gains `'home|own'`. A product's mutations type their variables as `CreateVariables`,
`UpdateVariables` and `DeleteVariables` from `~/query/offline/mutation-variables`, a delete carries its rows under
`rows`, and a renamed variables key registers an upgrade with `registerVariablesVersion`.

## What & why

`computeCan` built a channel's map from one membership, so an organization admin held no rights on the channels below,
and a cold-loaded settings page redirected its own admin. The offline helpers read queued variables through casts that
matched no create or delete: a description typed into a queued create was sent nowhere, and a row deleted offline came
back. `computeCan` now merges every grant on the channel and above it; `mutation-variables.ts` holds the three shapes.

## Blast radius

Sync-breaking for an app that calls `requireEntityAction` or `squashIntoPendingCreate`, or switches over `CanState`. A
product whose delete keeps its own row key compiles and behaves as before. No database change and no
`clientCacheVersion` bump: a delete queued in the old shape is upgraded when the queue is restored.

## Run

No script: manual.

## Manual steps

1. Every `beforeLoad` that calls `requireEntityAction`: make it `async` and `await` the call. It reads the caller's memberships itself, so a guard of an app's own that fetched them for a cold load is deleted in favour of it.
2. A helper that added an ancestor membership's rights to a channel's `can` map, or a branch that handled a row without a map for an admin above it: delete it and read `entity.can`. The map counts those memberships.
3. A direct `computeCan(channelType, membership, policyMatrix)` call keeps compiling with one grant. To count the grants above, pass the list: `{ channelType, role }` per membership on the channel and on its ancestors.
4. A `switch` over every `CanState`: add `'home|own'` (the row is homed at the channel, or the actor created it). Code that calls `resolveCan` needs nothing.
5. Each `squashIntoPendingCreate(queryClient, keys.create, id, ops)` call: add the creatable keys, `Object.keys(zCreate<Entity>Body.element.shape)` as `attachment/query-mutations.ts` does. A list of create fields and a check of an app's own that kept other fields out of the fold are deleted.
6. Each product's `query-mutations.ts`: type the variables as `CreateVariables<Row>`, `UpdateVariables<Ops>` and `DeleteVariables<Row>`, and rename the delete's row key (`attachments`, `tasks`, ...) to `rows` in the mutation function, the delete options and the hook's `prepare`.
7. For each delete renamed in step 6, next to the mutation defaults in `query.ts`: `registerVariablesVersion(keys.delete, 2, upgrade)`, where `upgrade` moves the old key to `rows` and returns null for anything else, as `attachment/query.ts` does. A queued mutation an upgrade returns null for is quarantined in `failedSync` and not replayed.
8. Check that each product's `query.ts` is reached by static imports from `frontend/src/main.tsx`, not only through a lazy route or layout. A queue is restored before a lazy chunk loads, and neither the mutation defaults nor the version of step 7 reach a mutation restored before them.
9. A delete's `onSettled`: invalidate the list also when the answer names `rejectedIds`, as `attachment/query.ts` does. A row put back missed the remote changes that arrived while its delete was pending.
10. A test that builds delete variables by hand (`{ attachments: [...] }`): use `rows`.

## Verify

```sh
pnpm check
pnpm test:core
pnpm unused
```
