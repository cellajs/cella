---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: thumbnail.png
---

# The link preview image is a shot: thumbnail.jpg

`frontend/index.html` names `frontend/public/thumbnail.jpg`, which `pnpm cella shoot thumbnail` writes from the new
`/thumbnail` page (`frontend/src/modules/common/thumbnail-page.tsx`): the `c:tagline.text` translation over the app's
`readme` screenshot. An app sets its tagline in `app.json`, ignores `thumbnail.jpg` in `cella/cella.config.ts`, shoots
the image and deletes `thumbnail.png`.

## What & why

The old `thumbnail.png` was a hand-made 1600x913 image, which link previews crop to 1.91:1, and `index.html` named it by
a relative URL without `twitter:card`. The image is now a 1200x630 dark JPEG shot with the other marketing images.
`index.html` names it by an absolute URL with a content hash, its size, an alt text and `twitter:card`.

## Blast radius

Every app: the upgrade brings the template's `thumbnail.jpg`, which shows cella until the app shoots its own. An app
that removes the `readme` shot in `cella/screenshots.app.ts` removes `thumbnail` too, or overrides it. No wire, cache or
schema change.

## Run

No script: manual.

## Manual steps

1. In `cella/cella.config.ts`, replace `'frontend/public/thumbnail.png'` in `overrides.ignored` with `'frontend/public/thumbnail.jpg'`.
2. Add `"tagline.text"` to `shared/locales/en/app.json`: the app's headline, at most two lines in the image.
3. Run `pnpm cella shoot thumbnail` and judge `frontend/public/thumbnail.jpg` by the screenshots skill.
4. Run `git rm frontend/public/thumbnail.png`.

## Verify

```sh
pnpm check
```
