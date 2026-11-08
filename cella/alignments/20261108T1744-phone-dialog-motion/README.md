---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: overlayClassName, max-sm:data-open:slide-in-from, max-sm:data-closed:slide-out-to, data-open:animate-none
---

# Phone dialogs move with transitions, and DialogContent loses overlayClassName

Remove `overlayClassName` from every `DialogContent` in app code. A full-screen phone dialog that sets its own motion through keyframe classes (`max-sm:data-open:slide-in-from-*`, `data-open:animate-none!`) now sets `--phone-rise` or `transition-none!`.

## What & why

Below `sm`, a full-screen dialog in `ui/dialog.tsx` and its overlay are CSS transitions on `ease-out`, rising `--phone-rise` (144px) and fading, so a close during the enter reverses from where it is. Keyframe classes no longer run there. `searchDialogLayout` stopped hiding the overlay, which left `overlayClassName` without a caller.

## Blast radius

An app that passes `overlayClassName` or sets phone motion on a `DialogContent`. Any other app gets the new motion for free. Docked and inline dialogs and widths from `sm` up are unchanged. No wire, database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Delete `overlayClassName` from each `DialogContent`: a dialog that fills a phone screen covers its overlay once open.
2. Replace `max-sm:data-open:slide-in-from-*` and `max-sm:data-closed:slide-out-to-*` on a full-screen dialog with `max-sm:[--phone-rise:<distance>]`; a negative distance starts above the resting place.
3. Replace `data-open:animate-none!` and `data-closed:animate-none!` on a phone dialog with `transition-none!`.

## Verify

Open each dialog you changed at phone width and watch it enter and exit, then:

```sh
pnpm check
```
