---
syncBreaking: true
clientCacheBump: false
---

# Channel tiles are composed from `ChannelTile*` parts, and grids take `renderTile`

`ChannelGridTile` is gone: `frontend/src/modules/entities/entity-grid/channel-tile.tsx` exports the default
`ChannelTile` and the parts it is built from (`ChannelTileCard`, `ChannelTileBanner`, `ChannelTileRow`,
`ChannelTileHeading`, `ChannelTileStats`, `ChannelTileMembers`, `ChannelTileParentChip`, `ChannelTileFooter`,
`ChannelTileDescription`, `ChannelTileMembership`). `BaseEntityGrid` takes `renderTile(entity)` in place of
`tileComponent`. Point grids at `ChannelTile`, or compose a module's own tile from the parts, and delete app-owned tiles.

## What & why

Parts read the row from `ChannelTileCard` and run no queries. Member previews come from `included.members`
(`include=members`, the channel's most privileged role), counts from `included.counts`, and a pending invitation
from `invited`, which cache enrichment now sets from the cached invites list. Apps had grown tiles that drifted
from the shared one and fetched per tile. `refetchOnMountForCounts` is now `refetchOnMountForIncluded`.

## Blast radius

Sync-breaking: `ChannelGridTile` and `tileComponent` are removed. Organization tiles change look (admin
previews, counts, joined button). No database change, no cache bump.

## Run

No script: manual.

## Manual steps

1. Find tiles and grids: `grep -rn "ChannelGridTile\|tileComponent\|refetchOnMountForCounts" frontend/src`.
2. Each grid passes `renderTile={(entity) => <ChannelTile entity={entity} hideOwnRole={…} />}` and drops its `useCallback` tile wrapper and casts.
3. Each grid asks for `include: 'counts,members'`; its list query sets `refetchOnMount: refetchOnMountForIncluded(include)`.
4. Each channel list operation answers `include=members` with `findMemberPreviewsByChannels`, as `get-organizations.ts` does.
5. A tile that differs composes the parts in its module: `ChannelTileStats countRole`, `ChannelTileParentChip`, `ChannelTileMembership fallback` for a join button, `ChannelTileRow` with `leading` and `meta` for a banner-less row.
6. A grid of rows the viewer may be invited to loads `meInvitationsQueryOptions()` once, so enrichment can set `invited`.
7. Delete the app's own tile, and its user-sheet avatar button in favor of `~/modules/user/member-avatar`.
8. Remove `in_channel` and `no_description` from `locales/*/app.json` when they match the new `common.json` keys.

## Verify

```sh
pnpm check
pnpm unused
pnpm test:storybook
```
