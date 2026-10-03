---
syncBreaking: true
clientCacheBump: false
---

# Status colors, field borders and the focus ring meet contrast

`--success`, `--warning` and `--input` are darker in light mode, and dark mode sets `--destructive`, `--success` and
`--warning` to light fills with a dark `-foreground`. App code that puts `text-white` on a status fill, or dims one with
`dark:bg-destructive/60`, uses `text-<status>-foreground` on the plain fill. Focus rings take the `focus-ring:` variant
where they took `sm:`. `CardTitle` takes `level` for a title that heads a section, and `TagExpandLink` requires
`tagName`.

## What & why

The accessibility audit measured white on `--success` at 3.6:1, `--destructive` text in dark mode at 2.9:1 and field
borders at 1.4:1. One rule now holds for the three status tokens: the fill carries its `-foreground` text and reads as
text on the page, in both modes. `--input` gives borders 3:1. The `focus-ring` variant (`tailwind-plugin.ts`) draws the
ring from `sm` up and on any fine pointer, so a desktop zoomed to 400% keeps it.

## Blast radius

Frontend styling only. Sync-breaking for an app that overrides these tokens, sets its own text color on a status fill,
or gates its own focus rings on `sm:`. An app that uses `bg-x text-x-foreground` and `focus-effect` is unaffected. No
database change, no `clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. `text-white` on `bg-success`, `bg-warning` or `bg-destructive` → `text-success-foreground` and so on.
2. Drop `dark:bg-destructive/60` and other dark-mode dims of a status fill; a solid hover fades to `/90`.
3. A theme that overrides `--success`, `--warning`, `--destructive` or `--input` re-checks 4.5:1 for text and 3:1 for borders.
4. `sm:focus-visible:ring-*`, `sm:focus-within:ring-*` and `sm:has-[…]:ring-*` → the same class under `focus-ring:`.
5. A `<CardTitle>` that heads a section of the page takes `level={2}` (or the level that fits).
6. `<TagExpandLink>` calls add `tagName`.

## Verify

```sh
pnpm check
pnpm style
```
