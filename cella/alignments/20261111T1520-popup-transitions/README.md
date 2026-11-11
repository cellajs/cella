---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: animate-in, animate-out, fade-in, fade-out, zoom-in, zoom-out, slide-in-from, slide-out-to, fill-mode-, repeat-, tw-animate-css
---

# Popups enter as transitions, tw-animate-css is gone

An app file that enters or exits with tw-animate's keyframe utilities (`animate-in`, `animate-out`, `fade-in-0`,
`zoom-in-95`, `slide-in-from-*`, `slide-out-to-*`, `fill-mode-forwards`, `repeat-5`) rewrites them as a transition:
`mount-fade` for content that appears, `popupMotionClass` from `~/modules/ui/popup-motion` for a popup Base UI
positions, `data-starting-style:` and `data-ending-style:` classes on a `transition-*` for an overlay of its own. An app
whose `frontend/package.json` lists `tw-animate-css` removes it.

## What & why

Every Base UI popup, the dialog and the sheet enter and exit through `data-starting-style` and `data-ending-style`
on a CSS transition, which reverses when a close interrupts the enter and honors reduced motion through `motion-safe:`;
the keyframe recipe did neither. With the primitives converted, `tw-animate-css` had six mount fades left, now the
`mount-fade` utility, and is removed from `frontend/package.json` and `styling/tailwind.css`.

## Blast radius

App files that still write the keyframe utilities render without an enter or exit: the classes stop existing, and
nothing fails at typecheck. An app that never wrote them is unaffected. No database, wire, lens or
`clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Grep app files for the `grep` terms above; template files arrive converted.
2. Content that appears: replace `fade-in animate-in duration-N` with `mount-fade duration-N` (150 is the default).
3. A popup of the app's own on a Base UI Popup: replace its enter and exit classes with `popupMotionClass`.
4. An overlay or panel of the app's own: `transition-[opacity,translate,scale] duration-N data-starting-style:opacity-0 data-ending-style:opacity-0`, plus `motion-safe:data-starting-style:<translate or scale>` and the same for `data-ending-style`.
5. `repeat-N` becomes `[animation-iteration-count:N]`; `fill-mode-forwards` goes with the keyframe it served.
6. Remove `tw-animate-css` from `frontend/package.json` and run `pnpm install`.

## Verify

```sh
pnpm check
```
