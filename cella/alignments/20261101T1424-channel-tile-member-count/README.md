---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: ChannelTileStats, ChannelTileFooter, ChannelTileDescription, ChannelTileMembership
---

# The member count moves from ChannelTileStats to ChannelTileMemberCount

`ChannelTileStats` no longer shows members or a draft's pending invites and drops its `countRole` prop. An app tile that composes the parts adds `<ChannelTileMemberCount countRole={role} />` to its `ChannelTileFooter`, or its tile loses the count.

## What & why

The role button no longer fills the tile: `ChannelTileMembership` takes its own width, with `ChannelTileMemberCount` at the end of the line. That frees the heading for the latest post date, which `ChannelTileStats` now shows on a phone too. `ChannelTileFooter` wraps its parts in lines, and `ChannelTileDescription` takes a line of its own. The banner is taller.

## Blast radius

Apps that compose tiles from the parts. A `countRole` prop fails the typecheck; a bare `ChannelTileStats` loses the count without an error, so it needs the grep. Tiles using the default `ChannelTile` are unaffected. No `clientCacheVersion`, lens or database change.

## Run

No script: manual.

## Manual steps

1. Move `countRole` from `ChannelTileStats` to a new `ChannelTileMemberCount` in the tile's `ChannelTileFooter`, after `ChannelTileMembership`.
2. In a banner-less `ChannelTileRow` that needs the count, pass the count through the heading's `meta`.
3. Check any tile with its own footer children: a part that relied on stretching to full width now needs `w-full`.

## Verify

```sh
pnpm check
```
