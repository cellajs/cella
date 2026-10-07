---
syncBreaking: false
clientCacheBump: false
---

# Morph grains keep a minimum size on a small canvas

`frontend/src/modules/common/morph-animation/renderer.ts` now lowers the grid density on a small
canvas, so a grain never draws smaller than `MIN_GRAIN_PX` (3 CSS pixels). The module is app-owned,
so a sync delivers none of this: an app that kept the template's renderer copies the three changes
below into its own copy.

## What & why

`grid` counts cells across the canvas, so grains shrank with it: about 4px on a laptop, 1.6px on a
phone, where the lower render resolution of touch devices left two canvas pixels per grain and the
plus stamp turned to noise. `drawFrame` now sends `min(grid, shortSide / (GRID_SPAN * MIN_GRAIN_PX))`
as `uGrid`: a phone draws the same piece with fewer, larger grains. At `grid={192}` a canvas of 720px
or more on its short side is unchanged.

## Blast radius

None automatic. The module sits in the default `ignored` list and no prop or call site changed, so
nothing stops compiling. An app with its own animation is unaffected. No database, schema or cache
impact.

## Run

No script: manual, and optional.

## Manual steps

To adopt it in your own `morph-animation/renderer.ts`:

1. Add `const GRID_SPAN = 1.25;` (the shader's `q = p * 0.625` spans 1.25 across the short side), `const MIN_GRAIN_PX = 3;` and a private `shortSide = 0`.
2. In `fitCanvas`, store the measured size: `this.shortSide = Math.min(rect.width, rect.height);`.
3. In `drawFrame`, send `Math.max(1, Math.min(this.grid, this.shortSide / (GRID_SPAN * MIN_GRAIN_PX)))` as `uGrid` in place of `this.grid`.

## Verify

```sh
pnpm check
```
