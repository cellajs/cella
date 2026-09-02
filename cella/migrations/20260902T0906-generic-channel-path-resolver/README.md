# Generic channel-path resolver replaces the register-channel-paths seam

## What & why

The sync engine's grant-boundary views and the fetch prioritizer's covering-channel computation
need the root-first `path` of a cached channel row. That resolution was a fork seam: cella shipped
an empty pinned `frontend/src/query/realtime/register-channel-paths.ts`, side-effect-imported from
the pinned `frontend/src/list-queries-config.tsx`, and each app called
`registerChannelPathResolver` with a loop over its own sub-organization channel types. Every app
ended up with the same loop, differing only in the type list, and that list is already declared by
the hierarchy. Nothing in it was app-specific: `path` is a generated column on every channel table
via `channelColumns`, and it reaches the wire on every channel type.

`resolveChannelPath` in `frontend/src/query/realtime/view-declaration.ts` now does the resolution
itself: it iterates `hierarchy.channelTypes` minus the root and reads `path` off the cached row via
`findInCache`. `registerChannelPathResolver` is removed, the seam file is deleted, and the pinned
entry is gone from `cella/cella.config.ts`. An app adding a channel type no longer has to remember
to extend a list; the hierarchy declaration is the only source.

## Blast radius

Sync-breaking for every app that owned a `register-channel-paths.ts`. Because that file and
`list-queries-config.tsx` are pinned in the app, the sync keeps both, so nothing breaks at merge
time. After the sync the app's `registerChannelPathResolver` import resolves to a missing export,
so `pnpm check` fails until the manual steps below are done. Behavior is identical to the loop
every known app registered: same cache lookup order, same null fallback to the organization view.
No database or wire-shape change; `clientCacheVersion` untouched. An app with a single-channel
hierarchy that never customized the file only needs steps 1 and 3.

## Run

No script — manual. Three deletions.

## Manual steps

1. Delete `frontend/src/query/realtime/register-channel-paths.ts` (`git rm`).
2. Remove the `import '~/query/realtime/register-channel-paths';` line from
   `frontend/src/list-queries-config.tsx`.
3. Remove `'frontend/src/query/realtime/register-channel-paths.ts'` from the `pinned` list in
   `cella/cella.config.ts`.
4. Only if the app's resolver did something other than read `path` off cached channel rows: move
   that logic into `resolveChannelPath` in `view-declaration.ts` and expect to carry the diff as a
   local change. No known app does.

## Verify

```sh
pnpm check
pnpm test:core
```

`grep -rn "register-channel-paths\|registerChannelPathResolver" --include="*.ts" --include="*.tsx" .`
(outside node_modules) must come back empty. In a running app with nested channels, open a
sub-organization channel as a member of that channel only and confirm the catchup request body
declares a view whose prefix is that channel's path, not just the organization id.
