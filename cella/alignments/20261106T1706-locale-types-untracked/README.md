---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: resources.gen.d.ts, locales:types
---

# The locale types file leaves git

`locales/resources.gen.d.ts` is generated and no longer tracked: the template ignores it in `.gitignore` and writes it
with `frontend/vite/write-locale-types.ts` on install and before every typecheck. An app adds the root scripts an
upgrade does not sync (`postinstall`, `locales:types`, and `pnpm locales:types` at the start of `ts` and `check`), then
untracks its copy with `git rm --cached locales/resources.gen.d.ts`.

## What & why

Only Vite wrote the file, at a dev start or a build. An English text committed without one left the tracked copy stale,
and the next dev start, testbed or build put that diff into someone's unrelated work. Generated on install and before
the typecheck, it needs no review and never shows in a diff.

## Blast radius

Every app. The `.gitignore` line arrives with the upgrade, the root `package.json` does not, and a line in `.gitignore`
leaves a tracked file tracked: the app keeps its copy as before until it takes both steps. Untracking it without the
scripts fails the typecheck of a fresh clone on the missing `locales/resources.gen` module. No wire, database or cache
change.

## Run

No script: manual.

## Manual steps

1. In the root `package.json`, add `"locales:types": "node frontend/vite/write-locale-types.ts"` and `"postinstall": "[ ! -e frontend/node_modules/shared ] || pnpm locales:types"`, and start `ts` and `check` with `pnpm locales:types &&`. The guard skips an install without the frontend's dependencies, such as an image build or a CI job that installs only some packages.
2. Run `git rm --cached locales/resources.gen.d.ts` and commit.

## Verify

Delete `locales/resources.gen.d.ts` and run `pnpm ts`: it writes the file again and passes.

```sh
pnpm check
```
