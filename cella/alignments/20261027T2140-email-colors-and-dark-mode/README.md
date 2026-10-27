---
syncBreaking: true
clientCacheBump: false
caughtBy: compiler
grep: theme.email, logo-email.png, logo-email-dark.png
---

# Mail colors come from `appConfig.theme.email`, and mail logos are files of their own

`ThemeConfig` requires `email` (`button`, `buttonEdge`, `buttonLabel`, `darkButton`, `darkButtonLabel`), so an app adds it
to `shared/config/config.default.ts`. Mail shows `frontend/public/static/common/logo/logo-email.png` and
`logo-email-dark.png`, which an app replaces with its own.

## What & why

Some mail clients darken a mail for dark mode and leave dark fills alone, so the black button and the dark logo
vanished. The button now takes a fill plus an edge that stand out on white and on dark panels, and the logo sits on a
light tile baked into the image. The mail's own dark styles, which Apple Mail and the Outlook apps apply, flip the
button and swap in the light logo.

## Blast radius

Sync-breaking for every app: typecheck flags the missing `theme.email`. An app whose brand is a mid-tone color can use
it as `button` and `buttonEdge` alike. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Add `theme.email` to `shared/config/config.default.ts`, copied from the template's or in the app's own colors.
2. Run `backend/tests/emails/email-colors.test.ts`: it fails a button that vanishes on a dark panel.
3. Replace `logo-email.png` (the logo on a light tile, 408 by 156 pixels) and `logo-email-dark.png` (a light logo, same size) with the app's own.

## Verify

```sh
pnpm check
pnpm test
```
