---
syncBreaking: true
clientCacheBump: false
---

# Open Sans gives way to Inter variable

The UI font is Inter, one variable file per script set in `public/static/ui/`. The Open Sans files are deleted and
`index.html` preloads `inter-latin-wght-5.3.0.woff2`. An app that pins `frontend/src/styling/tailwind.css` replaces
its `--font-sans` stack and its Open Sans `@font-face` rules with cella's Inter block; one that pins
`frontend/vite.config.ts` also keeps the Latin Extended file out of the precache.

## What & why

Five static Open Sans weights (295 KB, all preloaded at high priority) become one 48 KB variable Latin file plus an
85 KB Latin Extended file behind `unicode-range`. Inter is the closest free face to SF Pro. An `Inter Fallback` face on
a local Arial or Roboto, scaled to Inter's metrics, keeps the swap from shifting text. The 500 weight's
`font-display: block` workaround is gone, and `.prose h1` stays at weight 700.

## Blast radius

Sync-breaking for apps that pin `tailwind.css` (raak and projectcampus): the sync deletes the Open Sans files, while
the pinned rules still name them, so text silently falls back to a system font. No database or cache change.

## Run

No script: manual.

## Manual steps

1. In `frontend/src/styling/tailwind.css`, set `--font-sans` to cella's stack (`"Inter Variable", "Inter Fallback", system-ui, …`).
2. Replace the five Open Sans `@font-face` rules (and the 500-weight REMARK) with cella's `@layer base` block: two `Inter Variable` faces and the `Inter Fallback` face.
3. In the `.prose h1` rule, add `font-weight: 700;` and take cella's comment.
4. If you pin `frontend/vite.config.ts` (projectcampus does), add `'**/static/ui/inter-latin-ext-*'` to serwist's `globIgnores`.
5. Point app font stacks that fall back to "Open Sans" (projectcampus `.font-museo`) at `var(--font-sans)`.
6. In an app-owned `index.html`, replace any Open Sans preload with cella's single Inter preload.

## Verify

```sh
grep -rn "Open Sans\|OpenSans" frontend/src frontend/index.html
pnpm style
pnpm check
```
