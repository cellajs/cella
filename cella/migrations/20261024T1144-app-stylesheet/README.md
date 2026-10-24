---
syncBreaking: true
clientCacheBump: false
---

# An app's own styles live in app.css, so tailwind.css syncs

`frontend/src/styling/tailwind.css` imports a new app-owned `frontend/src/styling/app.css` into the `app` layer, which
ranks above the template's layers and utilities. The default sync config ignores that file and the marketing routes
(`frontend/src/routes/_public/_marketing/` and `_marketing.tsx`), and no longer pins
`frontend/src/modules/home/home-page.tsx`. An app creates `app.css`, moves the rules it added to a pinned
`tailwind.css` there, and unpins `tailwind.css`.

## What & why

Apps pinned the 606-line `tailwind.css` to keep a few added rules (brand tokens, fonts, layout offsets), so each upstream
change to it arrived by hand: four notes this month ask for such a copy. In `app.css` those rules win by layer order. The
marketing route files import the app-owned marketing module, and one came back after an app deleted it. The home page
fills its `home.sections` slot, so its pin only held upstream back.

## Blast radius

Sync-breaking: a synced `tailwind.css` imports `app.css`, which the sync never creates, so the frontend build fails until
the app adds it. An app that still pins `tailwind.css` builds as before. No database or cache change.

## Run

No script: manual.

## Manual steps

1. In `cella/cella.config.ts`, add `frontend/src/styling/app.css`, `frontend/src/routes/_public/_marketing` and `frontend/src/routes/_public/_marketing.tsx` to `ignored`, and drop entries inside that folder (raak: `sync-engine.tsx`).
2. Create `frontend/src/styling/app.css` with cella's comment.
3. If you pin `tailwind.css`, move each rule you added to it into `app.css` unchanged: an `@layer base` or `@layer utilities` block keeps working there.
4. Then take the template's copy (`git checkout <upstream.commit from cella/cella.manifest.json> -- frontend/src/styling/tailwind.css`), re-apply your remaining edits to template rules with a `/* fork: ... */` marker each, and remove it from `pinned`.
5. Remove `frontend/src/modules/home/home-page.tsx` from `pinned` unless you edited it.

## Verify

```sh
pnpm --filter frontend build
pnpm check
```
