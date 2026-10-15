---
syncBreaking: false
clientCacheBump: false
---

# ChannelRouteEntry and AppPartitionConfig move out of pinned files

`ChannelRouteEntry` now lives in `frontend/src/utils/channel-route.ts` and `AppPartitionConfig` in `backend/src/tables.ts`,
both synced. Your pinned `frontend/src/routes-config.tsx` and `backend/src/db/product-tables.ts` keep only values: delete
the type from each and import it from its new file.

## What & why

A pinned file never takes upstream changes, so a type kept in one stayed at the app's copy while synced code moved on.
In synced files, a change to either type reaches the app with the sync and shows as a type error at the value that no
longer fits. The board components now carry defaults for `--board-offset-sm`, `--board-offset-md` and
`--board-panel-offset` (4rem, 4.88rem, 146px), so a pinned stylesheet need not define them.

## Blast radius

Apps that pin these files, which is every app made from the template. Nothing breaks if you skip it: the copies keep
compiling, but later upstream changes to either type do not reach them. No database or cache change.

## Run

No script: manual.

## Manual steps

1. In `frontend/src/routes-config.tsx`, delete `export type ChannelRouteEntry` and the doc comment above `channelRouteConfig`; add `import type { ChannelRouteEntry } from '~/utils/channel-route';`. Keep the `satisfies Record<ChannelEntityType, ChannelRouteEntry>`.
2. Code of the app's own that imports `ChannelRouteEntry` from `~/routes-config` imports it from `~/utils/channel-route`.
3. In `backend/src/db/product-tables.ts`, delete `export type AppPartitionConfig`, import `AppPartitionConfig` from `#/tables` beside `ResolvableTable`, and drop the `AnyPgTable` and `PartitionConfig` imports.
4. If the app's stylesheet defines `--board-offset-sm`, `--board-offset-md` or `--board-panel-offset`, keep them: they override the defaults. They need no place in a pinned `tailwind.css`.

## Verify

```sh
pnpm --filter frontend ts
pnpm --filter backend ts
pnpm check
```
