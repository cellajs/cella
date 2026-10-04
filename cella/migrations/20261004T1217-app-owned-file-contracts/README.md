---
syncBreaking: true
clientCacheBump: false
---

# Logo title, accessibility review and the auth background: what synced files read from app-owned files

Three app-owned files have a contract that synced files depend on, and the sync never updates an app's copy: `Logo` in
`frontend/src/modules/common/logo.tsx` takes a `title`, `legal-config.ts` exports `accessibilityReview` and lists
`accessibility` in `legalConfig`, and `MorphAnimation` lays out its own `colony` background. Add each by hand. An app
that owns the marketing module also gets the list of accessibility fixes to port.

## What & why

#1281 and #1309 made synced files read `title` on `<Logo>` and `accessibilityReview` / `legalConfig.accessibility`
without a note; this is that note. New here: the layer classes `auth-layout.tsx` wrapped around
`<MorphAnimation variant="colony">` moved into `morph-animation.tsx`, so an app with its own auth background is no
longer shown at 20% opacity through a wrapper it does not control.

## Blast radius

Every app: all three files are in the default `ignored` list. Typecheck fails on the first two until they are added.
An app whose `morph-animation.tsx` is a copy of the template's shows the colony unstyled until step 3. No database
change, no `clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. `frontend/src/modules/common/logo.tsx`: add `title?: string | null`, defaulting to `appConfig.name`. With a title, render `<title>` inside the svg; without one, render the svg `aria-hidden`. Biome's `noSvgWithoutTitle` refuses a conditional `<title>`, so return two svg elements that share the shapes.
2. `frontend/src/modules/auth/legal/legal-config.ts`: add the `accessibility` entry to `legalConfig` (copy the template's sections) and export `accessibilityReview`. Before the app's own audit that is `export const accessibilityReview: AccessibilityReview = { standard: 'WCAG 2.2 Level AA', reviewedAt: null, limitations: [], report: null };`. The template's results are its own: do not copy them.
3. `frontend/src/modules/common/morph-animation/morph-animation.tsx`: for `variant === 'colony'`, wrap what you render in `<div className="pointer-events-none fixed inset-0 opacity-20 mix-blend-multiply dark:mix-blend-normal">`, or give your own background the look you want. Remove a workaround that escaped the old wrapper, such as a portal to the body.
4. An app that owns `frontend/src/modules/marketing` ports the accessibility fixes of #1281 to #1305: `<main>` in `about/about-page.tsx` and `layout.tsx`, `PageSpinner` as the Suspense fallback, `title` on the logo links in `nav.tsx` and `footer.tsx`, `text-white/60` on the footer's muted text, `focus-inset` in `legal/legal-aside.tsx`, and the first-visit menu label in `nav.tsx` (`useFirstTimeHint`).

## Verify

```sh
pnpm check
```
