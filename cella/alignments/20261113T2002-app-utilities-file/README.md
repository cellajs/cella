---
breaking: false
clientCacheBump: false
---

# An app's own utilities and variants get a file

Add `frontend/src/styling/app-utilities.css` to `ignored` in `cella/cella.config.ts`, beside `app.css`. An app then writes its own `@utility` and `@custom-variant` blocks in that file.

## What & why

`app.css` loads inside the `app` layer, where Tailwind refuses `@utility` and `@custom-variant`. An app had no place for a utility of its own and exported `tw` constants instead. `tailwind.css` now also imports `app-utilities.css`, without a layer. The template ships it empty.

## Blast radius

Every app, not breaking. The file arrives empty and changes no output. An app that skips the `ignored` entry sees its later edits to the file reported as drift.

## Run

No script: manual.

## Manual steps

1. `cella/cella.config.ts`: add `'frontend/src/styling/app-utilities.css'` to `ignored`.
2. Optional: move class strings that app files import from one another into utilities there, by the order in `frontend/README.md` (Class strings).

## Verify

`pnpm check`, then `pnpm --filter frontend build`: a broken `@utility` fails the Tailwind compile, which `pnpm check` does not run.
