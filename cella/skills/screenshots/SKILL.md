---
name: screenshots
description: Re-shoot the marketing screenshots this app ships: the device mockups and the hero's phone screen on /about, the README banner and the link preview image.
---

# Re-shooting the marketing screenshots

The images in `frontend/public/static/marketing/` and the link preview `frontend/public/thumbnail.jpg` are shipped files,
not generated ones: they show the app as it looked the day someone shot them. Re-shoot when the UI they show has moved: navigation, tables, the settings page, the theme.

`cella/screenshots.ts` lists what the template shoots, and `cella/screenshots.app.ts` what an app adds, removes or
overrides; `pnpm cella shoot` handles the mechanics. Picking the state and judging the result is this skill's job,
and the command cannot do it: run it, then **look at every image**.

## Run

- `pnpm cella shoot` shoots on a testbed seeded with the app's showcase: this checkout's running one, else one it
  starts and stops after. It signs in as the showcase's admin, writes both modes of every shot over the files the app
  ships, and prints each one's pixel and file size. Hold one (`pnpm testbed --showcase`) through a review loop, so
  a re-shoot skips its start.
- A trial run that leaves the working tree alone: `pnpm cella shoot --out <dir>`.
- One shot at a time, which is what the review loop uses: `pnpm cella shoot settings`.
- `format` is the file type of every shot. `'webp'` needs the `cwebp` encoder on the PATH, and the command stops before
  the testbed starts without it. It is written lossless, so the pixels are the screenshot's own; Chromium's own lossless
  WebP weighs about what the PNG does.

## The database

The shots show the showcase: `backend/scripts/seeds/showcase.json`, the curated dataset the app owns for its marketing images, seeded by
`pnpm seed showcase`. A dozen organizations with their members and attachments, the admin's menu with a few unseen
items, a short inbox, and MFA on for the admin (a passkey and an authenticator app nobody can sign in with) and a share
of the members. Its names, ids and counts come out the same on every run; only the times move with the clock, so a
re-shoot changes the pixels the UI changed and the dates. To change what the shots show, edit that file.

The app's own seed, faker data and bench rows serve development and the other testbed tools, and never reach the shots:
a testbed that switches between the seed and the showcase seeds a new database, and one that holds the showcase serves
no other tool. The showcase seed refuses the database `.env` names, since its admin's factors would lock that
account out.

An app's seed can be heavy, so shoot one app at a time, and shoot its tables with a wait for what they fill in last
(`membersFilled`, `tidyTable`).

## Look at every image before you keep it

Read each image. The command reports sizes, not whether a shot is worth shipping.

1. **Fill**: the shot matches its frame's ratio (`pc` and `pcWide` 16:9, `tablet` 3:4, `mobile` 9:16, `phone` 9:19.5,
   `card` 1.91:1). A
   slide renders `object-contain`, so a mismatch is letterboxed inside the mockup.
2. **Data**: tables full, no empty state, no one-row table, counts plausible. No real person's name or address: a
   database seeded from someone's own account puts their email in the first row of every member table.
3. **Empty-state affordances**: an admin sees "Upload cover" over an organization without one, and placeholder avatars
   where a real tenant has a logo. Give the entity a cover, or frame it out.
4. **State**: the menu sheet open where the shot wants it; no focus ring, hover state, open tooltip, toast, dev banner
   or first-visit hint.
5. **Theme**: the dark shot is actually dark, and lays out like its light twin.
6. **Crop**: a bottom row may be cut, which reads as "more below"; a header, a tab or a control may not.
7. **Text**: English, no raw `about:...` translation keys, no truncation that reads as broken.
8. **Weight**: at scale 2 a WebP shot weighs 50-120 KB, a PNG about three times that; the thumbnail JPEG about 90 KB. Heavier than that wants a
   smaller `scale` for its device; say so rather than shipping it quietly.
9. **Pair**: the light and dark shot show the same page, the same rows and the same scroll.

Then fix the shot's `open` or the data and re-shoot that one id.

## The link preview

`thumbnail` is the image `index.html` names for link previews: the `c:tagline.text` translation over the `readme` shot,
one dark JPEG at 1200x630, rendered by the development-only `/thumbnail` page. A full run shoots `readme` first and the
thumbnail shows that copy; `pnpm cella shoot thumbnail` alone shows the one the app ships. Judge it as the vendors show it:

- The headline keeps 60px from every edge and runs two lines at most.
- Nothing that must be read sits in the bottom-left corner, where X prints the domain over the image.
- Shrunk to 360px wide, Slack's size, the headline still reads.
- The middle 630x630 square, which WhatsApp and Telegram crop to, holds part of the headline and the screen. Marketing images are what a first-time visitor judges
the product by: a half-loaded table or a stray tooltip is worth another run.

## After

- `frontend/src/modules/marketing/marketing-config.tsx` needs a change only when a filename, the `format` or the set
  of slides changes. `README.md` references two of the same files by path. A changed `format` leaves the files of the
  old one behind: delete them.
- Replacing a file in place is enough for production: the deploy re-uploads a `static/` file whose content changed
  (`infra/tasks/frontend-assets.ts`). `index.html` names the thumbnail with a hash of its content, so a link preview
  fetches a re-shot one once the vendor reads the page again.

## In an app built on cella

`cella/screenshots.ts` and this file come with an upgrade. The app's own shots, devices and format go in
`cella/screenshots.app.ts` (`defineScreenshotsApp` from `@cellajs/cli/screenshots`), which no upgrade touches: a shot
with a base id replaces it, `remove` drops base shots the app does not ship. Reuse the base's helpers (`openMenu`,
`tidyHeader`, `hideDevUi`, `membersFilled`) rather than copies of them, so a template UI change reaches the app's shots
too. Without the file the app shoots the template's list. The command reads the app's own URL, ports and slug at
runtime, so an app with its own slug and a linked worktree both work with no configuration.

cella's About page also shows **raak** on a phone (`showcases/raak-*.webp`). Those are another product's pixels: run
this skill inside the raak checkout, whose shot list writes the four files to its gitignored `.temp/showcases/`
(`showcase-board` and `showcase-task`), then copy them into cella.

## Gotchas

- The color mode and the one-time UI flags live in the persisted ui store (`frontend/src/modules/ui/ui-store.ts`),
  whose key carries the app slug.
- The menu sheet is the sheeter's `#nav-sheet`, opened with `Alt+M` (`ControlOrMeta+K` search, `Alt+A` account). The
  `#<id>-nav` buttons are the mobile bottom bar's only: the desktop sidebar's carry no id, so a desktop shot that
  reaches for one waits 30 seconds and fails. Account sections are anchored as `#spy-<tool id>-anchor-wrap`.
- The sheet sits beside the content only from `2xl` (`appConfig.theme.screenSizes`, 1400px in cella) with "Keep menu
  open" on (`isDesktop` in `app-nav.tsx`); below it the sheet covers a table's first column. A shot with the menu open
  takes the `pcWide` device, kept at the first 16:9 size above `2xl`: every pixel wider draws the UI smaller in the
  mockup. "Keep menu open" lives in the per-user IndexedDB store, so it is set through its own switch.
- The menu lists hidden entities open by default (`activeSections` in the navigation store, same IndexedDB store).
  `openMenu` folds them through the section's own "Hidden" row.
- While the sheet is open the page behind it is out of the accessibility tree: `getByRole` finds nothing there and
  reports no error. Reach for the page with a CSS or text locator.
- A development build prints the entity id after the crumbs of a page header, and an admin gets an "Upload cover"
  button over an entity without a cover. `tidyHeader` in `cella/screenshots.ts` hides both.
- A Base UI switch keeps a 1x1 off-screen checkbox, and that is what carries the `id`. Clicking `#keepNavOpen` fails
  with "element is outside of the viewport" after 30 seconds; reach for `getByRole('switch', { name })`.
- Every run mints a session and signs it out at the end, and the account page lists it as another "Unnamed device"
  while it runs. That is why `settings` frames the authentication card and not the sessions card above it.
- To drive the app beyond a screenshot (breakpoints, scroll behavior), the `verify` skill has the rest.
