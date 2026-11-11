---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: collapse-motion, useMountedState, hasStarted, hasWaited, spinnerDelayMs, reducedMotion="user", behavior: 'smooth'
---

# Motion presets, one spinner delay, one mount settle

`collapseMotion` moved from `~/modules/common/collapse-motion` to `~/modules/common/motion-presets`, beside
`fadeMotion`, `swapMotion` and `scaleInMotion`. `useMountedState` is gone: `useDelayedFlag(true, settledAfterMountMs)`
from `~/hooks/use-delayed-flag` is a mount settle and `spinnerDelayMs` from `~/modules/common/spinner` the one spinner
delay. A nested `<MotionConfig reducedMotion="user">` drops the prop, and a scroll the app starts passes
`scrollBehavior()` from `~/utils/reduced-motion`.

## What & why

The template's motion timing now lives in presets and the four tiers the frontend README names under Motion, so a
component spreads a preset or names a constant and never a number in JSX. `useMountedState` served three jobs with two
magic numbers; `useDelayedFlag` with a named constant serves each. The root `MotionConfig` in `main.tsx` already reads
the reduced-motion setting, which nested configs inherit.

## Blast radius

App files that import `collapse-motion` or `useMountedState` fail typecheck until they follow steps 1 and 2. The rest
is a code-health follow-up that typecheck does not flag. No database, wire, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Change `~/modules/common/collapse-motion` imports to `~/modules/common/motion-presets`.
2. Replace `const { hasStarted } = useMountedState()` with `const hasStarted = useDelayedFlag(true, settledAfterMountMs)`; a reader of `hasWaited` (800 ms) names its own constant. An app-ignored copy of `morph-animation.tsx` is such a reader: take the upstream file.
3. Drop `reducedMotion="user"` from every `MotionConfig` below `main.tsx`.
4. Replace an inline motion timing with a preset: a chooser that grows into a form takes `scaleInMotion` (also as the `MotionConfig` transition), a keyed fade `fadeMotion`, a block opening by height `collapseMotion`; a grid-rows collapse animated through `motion` becomes `collapseMotion` or the `help-toggle` transition. A timing with no preset becomes a named constant at the top of its file.
5. Replace `behavior: 'smooth'` in a scroll the app starts with `behavior: scrollBehavior()`.
6. A width or opacity reveal animated through `motion` (a button that widens, a composer that fades with `visibility`, a badge that springs in) becomes a transition on its state attribute, as the menu section buttons and `mount-fade` show.

## Verify

```sh
pnpm check
```
