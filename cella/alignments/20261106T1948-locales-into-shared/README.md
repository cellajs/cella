---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: ../locales/, ../json/, 'locales/, 'json/
---

# Translations and data files move into shared

`locales/` is now `shared/locales/`, `json/` is now `shared/json/`, and `json/showcase.json` is now
`backend/scripts/seeds/showcase.json`. The upgrade moves the template's files and the app's copies of them. The app
renames those paths in its `cella/cella.config.ts`, which the upgrade asks for before it merges, and moves whatever
it added to the old folders itself.

## What & why

The root held two data folders that the services read by relative path and that each service image copied on its own.
`shared` is the package every service builds from, so `COPY shared/` now brings the translations and the data files
into every image. `#json/*` points at `shared/json/*`, and `showcase.json` sits beside the seed that reads it.

## Blast radius

Every app, with no wire, database or cache change. The CLI the template asks for moves an app's copies of moved ignored
and pinned files; an older one deletes them once the config names the new paths. The `20261028T1013-locale-patterns`
codemod reads `locales/`: run it first if still open.

## Run

No script: manual.

## Manual steps

1. When the upgrade stops on the changed CLI config, rename the `locales/` entries in `cella/cella.config.ts` to `shared/locales/`, the other `json/` entries to `shared/json/` and `json/showcase.json` to `backend/scripts/seeds/showcase.json`, commit, and rerun.
2. Keep each file the app added directly in a moved folder, such as an own namespace or data file: git reports it as `CONFLICT (file location)` at its new path, and `git add <new path>` keeps it.
3. Move each folder the app added, such as another language, with `git mv locales/<lng> shared/locales/<lng>`: the frontend loads only the languages under `shared/locales/`.
4. Add `shared/` to an app import that reaches a locale or data file by relative path (`../locales/`, `../json/`); `#json/` imports need no change.
5. Delete the generated `locales/resources.gen.d.ts`, so `locales/` and `json/` are gone; `pnpm install` writes it under `shared/locales/`.

## Verify

`pnpm cella i18n` lists every language the app ships, under `shared/locales/`.

```sh
test ! -e locales && test ! -e json
pnpm cella i18n
pnpm check
```
