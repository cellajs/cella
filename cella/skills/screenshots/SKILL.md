---
name: screenshots
description: Re-shoot the marketing screenshots this app ships: the device mockups on /about and the README banner.
---

# Re-shooting the marketing screenshots

The images in `frontend/public/static/marketing/` are shipped files, not generated ones: they show the app as it looked
the day someone shot them. Re-shoot when the UI they show has moved: navigation, tables, the settings page, the theme.

`shots-config.mjs` lists what this app shoots and is yours to edit; `shot-driver.mjs` handles the mechanics. Picking the
state and judging the result is this skill's job, and the driver cannot do it: run it, then **look at every image**.

## Run

- From the app's repo root: `node cella/skills/screenshots/shot-driver.mjs`. It starts `pnpm dev`, waits for the
  frontend and `/health`, mints a session for `ADMIN_EMAIL`, writes both modes of every shot over the files the app
  ships, and prints each one's pixel and file size.
- A trial run that leaves the working tree alone: `OUT_DIR=/tmp/shots node cella/skills/screenshots/shot-driver.mjs`.
- One shot at a time, which is what the review loop uses: `node cella/skills/screenshots/shot-driver.mjs settings`.
- `START= node ...` attaches to a stack that already answers. Use it whenever another checkout is already running a
  stack on the database in `backend/.env`: a second CDC worker (and `pnpm dev:single`, which folds CDC into the API)
  takes over the replication slot of the one that is running. Check first: `lsof -tiTCP:3000 -sTCP:LISTEN`.
- The driver never seeds. It shoots whatever is in the database `backend/.env` names, so run `pnpm seed` first if a
  table looks thin. Faker is unseeded, so every re-shoot swaps the names and dates: expect a full binary diff.

## Look at every image before you keep it

Read each PNG. The driver reports sizes, not whether a shot is worth shipping.

1. **Fill**: the shot matches its frame's ratio (`pc` 16:9, `tablet` 3:4, `mobile` 9:16). A slide renders
   `object-contain`, so a mismatch is letterboxed inside the mockup.
2. **Data**: tables full, no empty state, no one-row table, counts plausible. No real person's name or address: a
   database seeded from someone's own account puts their email in the first row of every member table.
3. **Empty-state affordances**: an admin sees "Upload cover" over an organization without one, and placeholder avatars
   where a real tenant has a logo. Give the entity a cover, or frame it out.
4. **State**: the menu sheet open where the shot wants it; no focus ring, hover state, open tooltip, toast, dev banner
   or first-visit hint.
5. **Theme**: the dark shot is actually dark, and lays out like its light twin.
6. **Crop**: a bottom row may be cut, which reads as "more below"; a header, a tab or a control may not.
7. **Text**: English, no raw `about:...` translation keys, no truncation that reads as broken.
8. **Weight**: a `pc` shot lands around 200-300 KB. Heavier than that wants a smaller `scale` in `shots-config.mjs`;
   say so rather than shipping it quietly.
9. **Pair**: the light and dark shot show the same page, the same rows and the same scroll.

Then fix the shot's `open` or the data and re-shoot that one id. Marketing images are what a first-time visitor judges
the product by: a half-loaded table or a stray tooltip is worth another run.

## After

- `frontend/src/modules/marketing/marketing-config.tsx` only needs a change when a filename or the set of slides
  changes; it lists the slides by URL. `README.md` references two of the same files by path.
- Replacing a file in place is enough for production: `infra/tasks/frontend-assets.ts` re-uploads a `static/` key when
  its ETag no longer matches, so no renaming is needed.

## In an app built on cella

The driver and this file come from the template; `shots-config.mjs` is pinned to the app, so it keeps your routes and
your output paths through a sync. The driver reads the app's own URL, ports and slug at runtime, so an app with its own
slug and a linked worktree both work with no configuration.

cella's About page also shows **raak** on a phone (`showcases/raak-*.png`). Those are another product's pixels: run this
skill inside the raak checkout against raak's own shot list, then copy the four files into cella.

## Gotchas

- The color mode and the one-time UI go into the persisted ui store, whose key carries the app slug
  (`frontend/src/modules/ui/ui-store.ts`), derived from the session cookie name. `themer.tsx` turns `mode` into the
  `.light` / `.dark` class.
- The menu sheet is the sheeter's `#nav-sheet`, opened with `Shift+M` (`Shift+F` search, `Shift+A` account). The
  `#<id>-nav` buttons are the mobile bottom bar's only: the desktop sidebar's carry no id, so a desktop shot that
  reaches for one waits 30 seconds and fails. Account sections are anchored as `#spy-<tool id>-anchor-wrap`.
- The sheet sits beside the content only from `2xl` up, with "Keep menu open" on (`isDesktop` in `app-nav.tsx`). Below
  1536px it covers the page, hiding a table's first column. That preference lives in the per-user IndexedDB store, so
  it is set through its own switch, not through localStorage.
- A Base UI switch keeps a 1x1 off-screen checkbox, and that is what carries the `id`. Clicking `#keepNavOpen` fails
  with "element is outside of the viewport" after 30 seconds; reach for `getByRole('switch', { name })`.
- Every run mints a session, which the account page then lists as another "Unnamed device": shoot `settings` on a
  freshly seeded database, or point it at `#spy-authentication`.
- Playwright and the signed dev cookie come from `../two-tab-sync-test/driver-lib.mjs`; `settle` is a copy of the one
  in `a11y/src/session.ts`, so keep the two in step.
- To drive the app beyond a screenshot (sign-in, breakpoints, scroll behavior), the `verify` skill has the rest.
