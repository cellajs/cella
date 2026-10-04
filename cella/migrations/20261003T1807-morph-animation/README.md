---
syncBreaking: true
clientCacheBump: false
---

# Morph animation replaces bg-animation

The auth background engine `frontend/src/modules/common/bg-animation/` is gone. A new app-owned
module `frontend/src/modules/common/morph-animation/` draws a generative, logo-shaped animation,
and the synced `auth-layout.tsx` and `marketing/about/hero.tsx` now lazy-import `MorphAnimation`
from it. The module is app-owned (the default `ignored` list names it). An app whose list still
names `bg-animation` receives the template's module once, with this sync: do step 1, then keep it,
replace it or empty it. An app whose list already names it creates the module itself.

## What & why

`bg-animation` (a ray-marching shader with feedback buffers) performed poorly and is deleted.
`morph-animation` renders the mark as a morphing "liquid pixel" shape in one cheap WebGL2 pass:
`shader.ts`, `renderer.ts`, `morph-animation.tsx`, `README.md`. Call sites:
`frontend/src/modules/auth/auth-layout.tsx` and `frontend/src/modules/marketing/about/hero.tsx`.
The drawn geometry is the template logo, so the module is app-owned, like `logo.tsx`.

## Blast radius

Sync-breaking for an app whose `ignored` list already names the module: the synced call sites
import a module the sync does not deliver. Every other app shows the template's mark until it acts.
No database, schema or cache impact. Apps that already replaced the auth layout and the about
hero with their own are unaffected.

## Run

No script: manual.

## Manual steps

1. In your `cella/cella.config.ts` `ignored` list, replace `frontend/src/modules/common/bg-animation` with `frontend/src/modules/common/morph-animation`.
2. Delete `frontend/src/modules/common/bg-animation/` from your app.
3. Create `frontend/src/modules/common/morph-animation/`: copy the upstream module (then fit `shader.ts` to your own mark's geometry and palette), or export your own `MorphAnimation`.
4. An empty shell is enough to compile: `morph-animation.tsx` exporting `MorphAnimation({ variant, grid, speed, overscan, stamp, className }: { variant?: 'single' | 'colony'; grid?: number; speed?: number; overscan?: number; stamp?: 'square' | 'plus'; className?: string })` that returns `null`.

## Verify

```sh
pnpm check
```
