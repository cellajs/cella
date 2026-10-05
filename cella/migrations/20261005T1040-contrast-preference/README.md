---
syncBreaking: true
clientCacheBump: false
---

# Field edges go back to subtle, and a `contrast` column carries the opt-in

`--input` returns to its resting value (`oklch(0.88 …)` light, `oklch(0.42 …)` dark) and a new `--edge-raised`
holds what `--border`, `--input` and `--sidebar-border` become under increased contrast. `users` gains
`contrast: 'system' | 'more'`, carried on `/me` and `PUT /me`, mirrored into the UI store by `user-store.ts` and
written to `<html data-contrast>` by `themer.tsx`. The accessibility audit now runs with the setting on, so an
app that keeps its own `a11y/scope-config.ts` has to opt in there or its report describes a state it did not
measure.

## What & why

cella#1302 raised `--input` to clear WCAG 1.4.11, which left form fields with a 3.37:1 edge beside outline
buttons at 1.27:1 and a borderless table search. shadcn ships `--border` and `--input` equal in light mode, so
the raised value was the outlier. Both tokens go back to rest and rise together behind `prefers-contrast: more`
or the stored preference, which the audit turns on. The style gate's `token-contrast` rule now measures
`--edge-raised` instead of `--input`, and reports a theme that has no `--edge-raised` at all.

## Blast radius

Every app: the users table takes a column, and the theme tokens change value. An app with its own
`tailwind.css` must add `--edge-raised` or the 3:1 gate reports it. An app with its own `a11y/scope-config.ts`
(all of them: the file is app-owned) keeps auditing the resting state until step 3 below. No cache bump: a
persisted user without the field reads as `system`.

## Run

```sh
pnpm cella migrate
```

Applies the schema migration. Steps 2 and 3 are manual.

## Manual steps

1. Run the migration: `ALTER TABLE users ADD COLUMN contrast varchar DEFAULT 'system' NOT NULL`.
2. In your `frontend/src/styling/tailwind.css`, add `--edge-raised` to both the `:root` and `.dark` blocks, at or above 3:1 against `--background` and `--card`, and copy the two override rules (`@media (prefers-contrast: more)` and `:root[data-contrast="more"]`) that reassign `--border`, `--input` and `--sidebar-border`. Lower `--input` to its resting value in the same pass, or fields keep the heavy edge the override is meant to add.
3. In `a11y/scope-config.ts`, import `auditContrast` from `./src/session.ts` and add the `PUT /me` that sets the audit user's `contrast` when it differs. Without it the browser context asks for more contrast but `/me` writes the user's stored `system` over the seeded UI store on every signed-in page, and the run measures the resting edges there without saying so.
4. Decide what your report claims. `auditContrast` in `a11y/src/session.ts` is the one switch: `'more'` measures the opted-in state and makes the report print that it did, `'system'` measures the default and expects 1.4.11 to come back below 3:1.
5. If your accessibility statement lists what a visitor can do, add the setting to that list: it is the remedy the 1.4.11 row points at.

## Verify

```sh
pnpm style
pnpm --filter shared exec vitest run scripts/check-token-contrast.test.ts
pnpm a11y:run
```
