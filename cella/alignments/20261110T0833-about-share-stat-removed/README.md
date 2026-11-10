---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: cellaLoc, totalLoc, useCountUp, showcase.from_cella
---

# The about page drops the code share, and counters roll

Remove `cellaLoc` and `totalLoc` from `showcaseItems` in `frontend/src/modules/marketing/marketing-config.tsx`. App code
that imports `useCountUp` from `about/counters.tsx` shows its number with `RollingNumber` from
`about/rolling-number.tsx`. App code that reads `about:showcase.from_cella` drops that call or keeps the text in a
locale file the app owns.

## What & why

The showcase no longer shows the share of an app's code that comes from Cella: `ShowcaseItem` loses `cellaLoc` and
`totalLoc`, and the `about:showcase.from_cella` key is gone. `useCountUp` and `CountUp` are gone from `counters.tsx`.
`Counters` shows each count with `RollingNumber`, whose digits roll once, a beat apart, keep the locale's separators
and stay still under reduced motion. Its cards render at once and roll when they scroll into view.

## Blast radius

An app with its own copy of `marketing-config.tsx`, the about locale or the showcase: the compiler flags the removed
fields, key and hook. An app that never changed the marketing module gets the change as it is. No wire, cache or schema
change.

## Run

No script: manual.

## Manual steps

1. Delete `cellaLoc` and `totalLoc` from each entry of `showcaseItems` in `frontend/src/modules/marketing/marketing-config.tsx`.
2. Replace a `useCountUp(start, end)` call with `<RollingNumber value={end} roll={inView} />` inside a flex parent.
3. Where app code still reads `about:showcase.from_cella`, drop the call or add the key to a locale file the app owns.

## Verify

```sh
pnpm check
```
