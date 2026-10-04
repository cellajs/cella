---
syncBreaking: true
clientCacheBump: false
---

# Morph animation replaces bg-animation

The auth background engine `frontend/src/modules/common/bg-animation/` is gone. A new app-owned
module `frontend/src/modules/common/morph-animation/` draws a generative, logo-shaped animation,
and the synced `auth-layout.tsx` and `marketing/about/hero.tsx` now lazy-import `MorphAnimation`
from it. The module never syncs (it is in the default `ignored` list), so an app must create it:
copy it from upstream, write its own, or ship an empty shell.

## What & why

`bg-animation` (a ray-marching shader with feedback buffers) performed poorly and is deleted.
`morph-animation` renders the mark as a morphing "liquid pixel" shape in one cheap WebGL2 pass:
`shader.ts`, `renderer.ts`, `morph-animation.tsx`, `README.md`. Call sites:
`frontend/src/modules/auth/auth-layout.tsx` and `frontend/src/modules/marketing/about/hero.tsx`.
The drawn geometry is the template logo, so the module is app-owned, like `logo.tsx`.

## Blast radius

Sync-breaking for every app: the synced call sites import a module the sync never delivers.
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
