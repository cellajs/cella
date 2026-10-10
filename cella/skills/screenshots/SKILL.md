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
- `format` in `shots-config.mjs` is the file type of every shot. `'webp'` needs the `cwebp` encoder on the PATH
  (`brew install webp`, `apt install webp`) and the driver stops before the stack boots without it. It is written
  lossless, so the pixels are the screenshot's own. Chromium's own canvas encoder is no substitute: its lossless WebP
  weighs about what the PNG does.

## A clean database beside a running stack

A development database that has been worked in fails the data check below: bench users, test rows, your own address,
dozens of sessions. Reseeding it costs you that data. Shoot from a throwaway database, with the stack you already run
left alone. Variables in the environment win over `backend/.env`, so nothing in the checkout changes:

```sh
# The image `pnpm docker` built (`docker images | grep db`), with the `-c` flags of `db` in backend/compose.yaml
docker run -d --name shots_db -e POSTGRES_PASSWORD=postgres -p 5470:5432 <image> -c wal_level=logical -c shared_preload_libraries=pg_cron -c cron.database_name=postgres

export DEV_PORT_OFFSET=70 ADMIN_EMAIL=admin-test@cellajs.com
export DATABASE_URL=postgres://runtime_role:dev_password@0.0.0.0:5470/postgres
export DATABASE_ADMIN_URL=postgres://postgres:postgres@0.0.0.0:5470/postgres
export DATABASE_CDC_URL=postgres://admin_role:dev_password@0.0.0.0:5470/postgres

pnpm seed                                                                  # migrates, then seeds
(cd backend && NODE_ENV=development pnpm exec tsx src/main.ts) &            # the API, 70 ports up
(cd frontend && NODE_ENV=development pnpm exec vite --mode development) &   # the app, 70 ports up
START= node cella/skills/screenshots/shot-driver.mjs
```

- Every command runs with those exports. `pnpm seed` without them reaches the database in `backend/.env` and adds
  its rows to the one you work in. An agent's shell keeps no exports between calls: put them in a wrapper script
  that ends in `exec "$@"`, and run each command through it.
- The driver's first line prints the origin it shoots. It must be the shifted one.
- The API and the frontend are enough: no shot needs the CDC worker or the relay.
- Both Vite servers share `frontend/node_modules/.vite`. The second one re-bundles the dependencies there, so the
  first re-bundles once more at its next start. Its running session keeps working.
- Afterwards stop the two listeners (`lsof -tiTCP:<port> -sTCP:LISTEN`) and `docker rm -fv shots_db`.

## Look at every image before you keep it

Read each PNG. The driver reports sizes, not whether a shot is worth shipping.

1. **Fill**: the shot matches its frame's ratio (`pc` and `pcWide` 16:9, `tablet` 3:4, `mobile` 9:16). A slide
   renders `object-contain`, so a mismatch is letterboxed inside the mockup.
2. **Data**: tables full, no empty state, no one-row table, counts plausible. No real person's name or address: a
   database seeded from someone's own account puts their email in the first row of every member table.
3. **Empty-state affordances**: an admin sees "Upload cover" over an organization without one, and placeholder avatars
   where a real tenant has a logo. Give the entity a cover, or frame it out.
4. **State**: the menu sheet open where the shot wants it; no focus ring, hover state, open tooltip, toast, dev banner
   or first-visit hint.
5. **Theme**: the dark shot is actually dark, and lays out like its light twin.
6. **Crop**: a bottom row may be cut, which reads as "more below"; a header, a tab or a control may not.
7. **Text**: English, no raw `about:...` translation keys, no truncation that reads as broken.
8. **Weight**: at scale 2 a WebP shot weighs 50-120 KB, a PNG about three times that. Heavier than that wants a
   smaller `scale` in `shots-config.mjs`; say so rather than shipping it quietly.
9. **Pair**: the light and dark shot show the same page, the same rows and the same scroll.

Then fix the shot's `open` or the data and re-shoot that one id. Marketing images are what a first-time visitor judges
the product by: a half-loaded table or a stray tooltip is worth another run.

## After

- `frontend/src/modules/marketing/marketing-config.tsx` only needs a change when a filename, the `format` or the set
  of slides changes; it lists the slides by URL and content type. `README.md` references two of the same files by
  path. A changed `format` leaves the files of the old one behind: delete them.
- Replacing a file in place is enough for production: `infra/tasks/frontend-assets.ts` re-uploads a `static/` key when
  its ETag no longer matches, so no renaming is needed.

## In an app built on cella

The driver and this file come from the template; `shots-config.mjs` is pinned to the app, so it keeps your routes and
your output paths through a sync. The driver reads the app's own URL, ports and slug at runtime, so an app with its own
slug and a linked worktree both work with no configuration.

cella's About page also shows **raak** on a phone (`showcases/raak-*.webp`). Those are another product's pixels: run
this skill inside the raak checkout, whose shot list writes the four files to its gitignored `.temp/showcases/`
(`showcase-board` and `showcase-task`), then copy them into cella.

## Gotchas

- The color mode and the one-time UI go into the persisted ui store, whose key carries the app slug
  (`frontend/src/modules/ui/ui-store.ts`), derived from the session cookie name. `themer.tsx` turns `mode` into the
  `.light` / `.dark` class.
- The menu sheet is the sheeter's `#nav-sheet`, opened with `Shift+M` (`Shift+F` search, `Shift+A` account). The
  `#<id>-nav` buttons are the mobile bottom bar's only: the desktop sidebar's carry no id, so a desktop shot that
  reaches for one waits 30 seconds and fails. Account sections are anchored as `#spy-<tool id>-anchor-wrap`.
- The sheet sits beside the content only from `2xl` up, with "Keep menu open" on (`isDesktop` in `app-nav.tsx`). Below
  it the sheet covers the page, hiding a table's first column: a shot with the menu open takes the `pcWide` device.
  `2xl` is the app's own, `appConfig.theme.screenSizes`, 1400px in cella and not Tailwind's 1536px: keep `pcWide` at
  the first 16:9 size above it, since every pixel wider draws the UI smaller in the mockup. That preference lives in
  the per-user IndexedDB store, so it is set through its own switch, not through localStorage.
- The menu lists archived entities open by default (`activeSections` in the navigation store, same IndexedDB store).
  `openMenu` folds them through the section's own "Archived" row.
- While the sheet is open the page behind it is out of the accessibility tree: `getByRole` finds nothing there and
  reports no error. Reach for the page with a CSS or text locator.
- A development build prints the entity id after the crumbs of a page header, and an admin gets an "Upload cover"
  button over an entity without a cover. `tidyHeader` in `shots-config.mjs` hides both.
- A Base UI switch keeps a 1x1 off-screen checkbox, and that is what carries the `id`. Clicking `#keepNavOpen` fails
  with "element is outside of the viewport" after 30 seconds; reach for `getByRole('switch', { name })`.
- Every run mints a session, which the account page then lists as another "Unnamed device". That is why `settings`
  frames the authentication card and not the sessions card above it.
- Playwright and the signed dev cookie come from `../two-tab-sync-test/driver-lib.mjs`; `settle` is a copy of the one
  in `a11y/src/session.ts`, so keep the two in step.
- To drive the app beyond a screenshot (sign-in, breakpoints, scroll behavior), the `verify` skill has the rest.
