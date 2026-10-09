---
syncBreaking: false
clientCacheBump: false
---

# The screenshots skill can write lossless WebP

`cella/skills/screenshots/shot-driver.mjs` reads an optional `format` from your pinned `shots-config.mjs`. Without it
your shots stay PNG and nothing changes. To switch, add `export const format = 'webp'`, re-shoot, and point the slides
in `marketing-config.tsx` and the images in `README.md` at the `.webp` files.

## What & why

The driver wrote Playwright's raw PNG, 190-320 KB a shot. With `format = 'webp'` it encodes each shot with
`cwebp -lossless -z 9`: the same pixels at under a third of the weight. The template's own `shots-config.mjs` also
gained a `pcWide` device, for a shot with the menu sheet open, and a `tidyHeader` helper that hides the
development-only entity id and the "Upload cover" button of a page header.

## Blast radius

Opt-in: a `shots-config.mjs` without `format` keeps writing PNG. `SKILL.md` names `pcWide` and `tidyHeader`, which
your pinned copy has only once you copy them. WebP slides leave the service worker precache, whose pattern lists
`png`. No database change, no cache bump.

## Run

No script: manual.

## Manual steps

1. Install the encoder: `brew install webp` or `apt install webp`.
2. In `cella/skills/screenshots/shots-config.mjs` add `export const format = 'webp';`. Optional, from the template's copy of that file: the `pcWide` device and the `tidyHeader` helper.
3. Re-shoot, then set `url`, `filename` and `contentType` (`image/webp`) of each slide in `frontend/src/modules/marketing/marketing-config.tsx` and the image paths in `README.md` to the `.webp` files.
4. Delete the `.png` files they replace.

## Verify

```sh
OUT_DIR=/tmp/shots node cella/skills/screenshots/shot-driver.mjs
pnpm check
```
