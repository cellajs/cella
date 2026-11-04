---
breaking: false
clientCacheBump: false
grep: hover:bg-muted, hover:bg-accent, dark:hover:bg-muted/50, bg-input/40, hover:bg-foreground/, --hover-fill
---

# One hover fill: bg-hover, and a -hover mix on an opaque fill

App code that hovers with `bg-muted`, `bg-accent`, `bg-accent/50`, `bg-muted/50`, `bg-input/40` or `bg-foreground/5`
to `/10` moves to `hover:bg-hover`; an element with its own opaque fill hovers with `bg-muted-hover` or
`bg-background-hover`. raak: `label/label-tile.tsx`; projectcampus: `channel-tile/channel-about-row.tsx`,
`comment/thread/comment-thread.tsx`, `material/materials-list.tsx`.

## What & why

Nine spellings of the neutral hover fill showed four strengths in dark mode: an outline tile hovered brighter than the
ghost rows beside it. `--hover` is now one tint of the foreground, the same step on any surface. `--muted-hover` and
`--background-hover` are an opaque fill with that tint mixed in, since a tint would replace the fill. `bg-accent` stays
the highlight of a menu or select option and the current nav item; `bg-sidebar-accent` stays the sidebar's.

## Blast radius

Not breaking: old classes still render, but they hover at a different strength than the template beside them. Outline
buttons hover softer in dark mode, table rows a little stronger in light mode. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. A hover on an element with no fill of its own (a row, a tile, a toggle, an icon button): replace the classes above with `hover:bg-hover` and drop any `dark:hover:` override.
2. A hover over the element's own `bg-secondary`, `bg-accent` or `bg-muted` (a `color-mix` or `/90` hover): `hover:bg-muted-hover`; over its own `bg-background`: `hover:bg-background-hover`.
3. A muted fill inside a hovered parent, such as a badge or a meter track: `group-hover/<name>:bg-muted-hover`.
4. Leave `aria-expanded:bg-muted` and `aria-pressed:bg-muted` (the open and pressed fill), `bg-accent` on highlighted options and the current nav item, and `bg-sidebar-accent`.

## Verify

`pnpm check`, then hover each changed element in light and dark mode: its fill should match a ghost button's on the same surface.
