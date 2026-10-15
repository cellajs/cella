---
syncBreaking: true
clientCacheBump: false
---

# One `ChannelTile` for every channel grid, shaped per channel by `channel.tile`

`ChannelGridTile` is gone: `frontend/src/modules/entities/entity-grid/tile.tsx` exports `ChannelTile`, the grid tile
for every channel type. A channel module shapes it through a `tile` entry in its `channel` registration
(`ChannelTileConfig` in `frontend/src/lib/entity-modules.ts`). Point grids at `ChannelTile`, move what an app-owned
tile does differently into `tile`, and delete the app's tile.

## What & why

The banner tile now carries a draft badge, a meta line (member count, post counts per `memberStatProductTypes` entry
with their `memberStatIcon`, latest post date), featured-role avatars, a parent chip, a description preview and the
joined button or a pending-invite badge. `tile` sets `layout` (`banner` or `compact`), `countRole`, `featuredRole`,
and the hooks `parent`, `leading`, `meta` and `join`. Apps had grown their own tiles, which drifted from the shared
one and never received its fixes.

## Blast radius

Sync-breaking: the `ChannelGridTile` export is removed. Organization tiles change look (admin avatars, counts,
joined button). No database change, no cache bump.

## Run

No script: manual.

## Manual steps

1. Find tiles: `grep -rn "ChannelGridTile\|tileComponent" frontend/src`.
2. Each channel grid passes `tileComponent={ChannelTile}` and requests `include: 'counts'`; wrap it in `useCallback` to pass `hideOwnRole` or `currentChannelId`, as `organizations-grid.tsx` does. Drop casts on `tileComponent`.
3. Per channel module, declare `tile`: the counted and featured roles, `parent` for a chip to the channel it sits in, `join` for a self-join button.
4. A banner-less row (for example a personal channel listing its child channels) uses `layout: 'compact'` with `leading` and `meta`.
5. Delete the app's own tile, and its user-sheet avatar button in favor of `~/modules/user/member-avatar`.
6. Remove `in_channel` and `no_description` from `locales/*/app.json` when they match the new `common.json` keys.

## Verify

```sh
pnpm check
pnpm unused
```
