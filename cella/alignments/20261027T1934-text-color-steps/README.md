---
syncBreaking: true
clientCacheBump: false
caughtBy: nothing
grep: text-muted-foreground/70, text-muted-foreground/60, text-muted-foreground/50, text-foreground/80, text-foreground/90, text-sidebar-foreground/70, placeholder:text-muted-foreground, text-gray, text-slate, uppercase, lowercase, font-medium text-muted-foreground text-sm
roots: frontend/src
---

# Text takes one of four color steps, and labels over content use group-label

App code colors text with `text-foreground`, `text-foreground-soft`, `text-muted-foreground` or the new
`text-faint-foreground`, never with an opacity modifier (`text-muted-foreground/70`), a palette gray (`text-slate-400`)
or `opacity-*` on text at rest. A label that heads content (a column, a list, a group, a key) takes the `group-label`
utility, and every label is sentence case. The codemod rewrites the modifiers and lists the rest.

## What & why

Text rendered in fifteen grays, three of them below 4.5:1, and a label had nine recipes. `tailwind.css` now holds four
steps by role (content, reading, support, hint), `--faint-foreground` is new, dark `--muted-foreground` steps down to
match light, and six `*-foreground` aliases point at `--foreground`. `pnpm style` fails on a text token with a modifier
and on palette grays; `pnpm style:audit` lists opacity on text.

## Blast radius

Frontend only. Sync-breaking for app files with modifiers or palette grays: `pnpm style` fails on them. Opacity on
text, case transforms and hand-rolled labels only show by reading. An app without its own components only sees the new
look. No database, lens or `clientCacheVersion` change.

## Run

```sh
pnpm cella align --run 20261027T1934-text-color-steps                          # report only
pnpm cella align --run 20261027T1934-text-color-steps -- rewrite frontend/src   # apply
```

## Manual steps

1. For each `judge` line the report prints, pick the step by role: hints (placeholders, empty states, counts, separators) `text-faint-foreground`, support (descriptions, metadata) `text-muted-foreground`, running text `text-foreground-soft`.
2. Replace `opacity-50` to `opacity-80` on text at rest with that step, and its hover or active `opacity-100` with `text-foreground`; opacity stays on icons, transitions, hover reveals and disabled states.
3. Replace palette grays with a step; a surface that stays dark in both themes takes the `dark` class, so its tokens read the dark values.
4. Replace a hand-rolled label recipe over content with `group-label`; a field label keeps `font-medium text-sm` at the content step.
5. Drop `uppercase` and `lowercase` from labels, and lowercase a noun inside a phrase in code (`t('c:item', { count }).toLowerCase()`).
6. An app that sets text tokens in `frontend/src/styling/app.css` adds `--faint-foreground` in light and dark, at 4.5:1 on `--muted`.
7. A `DropdownMenuLabel`, `SelectLabel` or `SidebarGroupLabel` used for content (a question, a title) passes `font-normal text-foreground`.

## Verify

```sh
pnpm cella align --run 20261027T1934-text-color-steps   # empty apart from the accepted template paths it names
pnpm style:audit                                        # no text-color markers left
pnpm check
```

Then look at the app's own pages in light and dark mode, with increased contrast on and off.
