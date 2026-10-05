---
syncBreaking: false
clientCacheBump: false
---

# The marketing screenshots are re-shot by the `screenshots` skill

`cella/skills/screenshots/` arrives with this sync: `shot-driver.mjs` drives the app and writes a light and a dark
image per shot, and `shots-config.mjs` lists which pages it shoots. That list is cella's, pinned to your app, so edit
it to name your own routes and output paths before you run the driver over the images you ship.

## What & why

The images under `frontend/public/static/marketing/` are hand-made files that age the moment the UI moves, and every
app carries its own. The skill turns re-shooting them into one command plus a review, instead of a round of cropping
screenshots by hand. `shots-config.mjs` is pinned (`cella/cella.config.ts`), so a later sync never rewrites your list.

## Blast radius

Nothing runs on its own and no shipped code imports it, so an app that ignores the skill is unaffected. The images it
would overwrite are the ones in your own `frontend/public/static/marketing/`. No database change, no cache bump.

## Run

No script: manual.

## Manual steps

1. Open `cella/skills/screenshots/shots-config.mjs` and replace cella's `shots` with your own pages: each entry names a route (`{org}` is filled by the resolver above it), a device preset and the output path it writes.
2. Check the device presets against your own `device-mockup-frame.tsx` if you changed the frames: the ratio has to match, or the slide is letterboxed inside the mockup.
3. Drop the shots you do not ship. An app with no marketing module can delete the file and keep the skill for other screenshots.

## Verify

```sh
OUT_DIR=/tmp/shots node cella/skills/screenshots/shot-driver.mjs
```
