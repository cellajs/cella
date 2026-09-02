# Generic channel-path resolver replaces the register-channel-paths seam

## What & why

`resolveChannelPath` in `frontend/src/query/realtime/view-declaration.ts` now resolves a cached
channel row's root-first `path` itself: it iterates `hierarchy.channelTypes` minus the root and
reads `path` off the row via `findInCache`. Removed: `registerChannelPathResolver`, the pinned
`frontend/src/query/realtime/register-channel-paths.ts` (side-effect-imported from
`frontend/src/list-queries-config.tsx`), and its pinned entry in `cella/cella.config.ts`.

## Blast radius

Sync-breaking for apps that owned a `register-channel-paths.ts`: both files are pinned so the
merge is clean, but `registerChannelPathResolver` then resolves to a missing export and
`pnpm check` fails until the steps below. No DB or wire change; `clientCacheVersion` untouched. A
never-customized single-channel app needs only steps 1 and 3.

## Run

No script: manual.

## Manual steps

1. `git rm frontend/src/query/realtime/register-channel-paths.ts`.
2. Remove `import '~/query/realtime/register-channel-paths';` from
   `frontend/src/list-queries-config.tsx`.
3. Remove `'frontend/src/query/realtime/register-channel-paths.ts'` from `pinned` in
   `cella/cella.config.ts`.
4. Only if the app's resolver did more than read `path` off cached channel rows: move that logic
   into `resolveChannelPath` in `view-declaration.ts` and carry the diff locally. No known app does.

## Verify

```sh
pnpm check
pnpm test:core
grep -rn "register-channel-paths\|registerChannelPathResolver" --include="*.ts" --include="*.tsx" .   # outside node_modules, must be empty
# nested channels: a member of only a sub-organization channel must send a catchup view prefixed by that channel's path
```
