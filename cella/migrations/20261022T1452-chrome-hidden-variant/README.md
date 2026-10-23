---
syncBreaking: true
clientCacheBump: false
---

# Pinned tailwind.css gains the chrome-hidden variant

The synced floating nav buttons and mobile bottom bar hide through a new `chrome-hidden:` variant. An app that pins
`frontend/src/styling/tailwind.css` adds the `@custom-variant chrome-hidden` line to its copy; raak also moves its
`#create-task` rule into an `@layer utilities` block.

## What & why

`floating-nav/button.tsx` repeated four classes under `group-[.selection-active]/body:` and again under
`group-[.keyboard-open]/body:`; `bottom-bar-nav.tsx` paired the two for `translate-y-full`. Both now use one
`chrome-hidden:` variant. The `body:has([data-board-empty]) #create-task` rule sat in `@layer base`, where the
button's `inline-flex` utility outranks any selector, so the empty board never hid the button.

## Blast radius

Apps that pin `tailwind.css` (raak and projectcampus do). Without the line, `chrome-hidden:` compiles to nothing: the
floating buttons and bottom bar stay up under the selection bar and the keyboard, and `pnpm style` fails. No database
or cache change.

## Run

No script: manual.

## Manual steps

1. In `frontend/src/styling/tailwind.css`, after `@custom-variant focus-view`, add `@custom-variant chrome-hidden (&:is(.selection-active *, .keyboard-open *));`.
2. If the file has the `body:has([data-board-empty]) #create-task` rule, move it out of `@layer base` into an `@layer utilities { ... }` block after that line.

## Verify

```sh
pnpm style
pnpm check
```
