---
syncBreaking: false
clientCacheBump: false
---

# The morph mark condenses on mount instead of fading in

`frontend/src/modules/common/morph-animation/` gained an entrance: on its first drawn seconds the
grain survival falloff starts wide open, so sparse grains dust the whole frame, and as it tightens
they wink out from the outside in until the mark precipitates. The CSS crossfade that used to reveal
the canvas now runs only under `prefers-reduced-motion`. The module is app-owned, so a sync delivers
none of this: an app that wants the entrance copies the four changes below into its own copy.

## What & why

The old reveal was a 2s `opacity` transition on the canvas while the field already churned
underneath, so it read as a random fade rather than as an arrival. The entrance instead moves the
knobs the grain renderer already has, which is why it costs one uniform and no new passes: `uEnter`
runs 0 to 1 over `ENTER_SECONDS` and every factor it drives is the identity at 1, so the resting
piece is unchanged and the shader does no extra work once the entrance is over. Variants that make
grains travel (an imploding scatter, a growth front from a seed) were prototyped and rejected for
the hero: they pull the eye to the decoration while the headline is still arriving.

## Blast radius

None automatic. The module sits in the default `ignored` list, so an app keeps its own copy and its
own reveal; nothing stops compiling and no call site changed. The synced call sites
(`frontend/src/modules/auth/auth-layout.tsx`, `frontend/src/modules/marketing/about/hero.tsx`) only
gained a comment: both get the entrance through the module, with no prop to pass. No database,
schema or cache impact.

## Run

No script: manual, and optional.

## Manual steps

To adopt it in your own `morph-animation/`:

1. `shader.ts`: declare `uniform float uEnter;` and, in `pixelLiquid`, derive the eased progress and
   drive three factors from it (each one the identity at `uEnter = 1`):

   ```glsl
   float ez = uEnter * uEnter * (3.0 - 2.0 * uEnter);
   K = mix(0.75, K, ez * ez);              /* before p is computed from K */
   p *= mix(0.10, 1.0, ez);                /* after the flicker term */
   /* and in the return: alphaMul * mix(0.45, 1.0, ez) */
   ```

2. `renderer.ts`: add `'uEnter'` to `UNIFORM_NAMES`, a private `enter = 0`, and
   `const ENTER_SECONDS = 2.4;`. In `drawFrame`, advance it by real time before the uniforms go up:
   `this.enter = Math.min(1, this.enter + dt / ENTER_SECONDS);` then
   `gl.uniform1f(u.uEnter, this.enter)`. Advancing on drawn frames only means an instance that
   mounts off-screen enters when it scrolls into view, since `setPaused` stops the loop.
3. `renderer.ts`: expose `skipEntrance() { this.enter = 1; }`.
4. `morph-animation.tsx`: call `renderer.skipEntrance()` inside the `prefers-reduced-motion` handler,
   and scope the canvas crossfade classes to `motion-reduce:` so it only reveals the piece when the
   entrance is skipped.

Tune `ENTER_SECONDS` to your own mark: 2.4s suits a shape that fills the hero, a smaller mark reads
better nearer 1.5s.

## Verify

```sh
pnpm check
```

Then load `/about` and the sign-in page with an empty cache, and again with reduced motion on: the
first shows the dusted frame condensing, the second opens at rest and fades in.
