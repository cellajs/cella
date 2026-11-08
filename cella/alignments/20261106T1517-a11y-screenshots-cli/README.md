---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: scope-config, shots-config, shot-driver, session-lib, a11y/src/, pnpm a11y, a11y:run, -C a11y, OUT_DIR=
---

# The audit and the screenshots run from `@cellajs/cli`, with adapters in `cella/`

The `a11y/` workspace and `cella/skills/screenshots/shot-driver.mjs` are gone: `pnpm cella a11y` (jobs `audit`,
`report`, `decide`) and `pnpm cella shoot [ids]` run on a testbed. The pinned `a11y/scope-config.ts` and
`cella/skills/screenshots/shots-config.mjs` give way to the synced `cella/a11y.ts` and `cella/screenshots.ts` plus an
optional `cella/a11y.app.ts` and `cella/screenshots.app.ts` that hold only what an app adds, removes or overrides.
Scripts on `cella/skills/verify/session-lib.mjs` or `a11y/src/session.ts` move to `@cellajs/cli/drive`.

## What & why

Each template UI change to a state's opener needed an alignment and a hand edit in every app's pinned copy, and one app
missed one. The engines ship in `@cellajs/cli`, the template's states and shots travel with the UI they describe, and a
delta reuses the base's openers (`openAccountSheet`, `openMenu`). The root scripts `a11y` and `a11y:run` are gone.

## Blast radius

Every app. No wire, cache or schema change. An app that never edited its scope or shot list deletes the two old files
and writes no delta. An app with states or shots of its own ports them by hand.

## Run

No script: manual.

## Manual steps

1. In `cella/cella.config.ts`, drop `'a11y/scope-config.ts'` and `'cella/skills/screenshots/shots-config.mjs'` from `pinned`.
2. Read the old scope with `git show main:a11y/scope-config.ts` (the merge may have deleted it) beside `cella/a11y.ts`.
3. Write what differs into `cella/a11y.app.ts`: states of your own in `add`, template states you dropped in `remove`, a
   template state you changed in `add` under its id, resolvers of your own in `placeholders`, extra setup in `prepare`.
   Open template overlays with the base's helpers, never a copied keystroke. Mark a state with a form with `forms`.

   ```ts
   import { defineA11yApp } from '@cellajs/cli/a11y';
   import { openAccountSheet } from './a11y.ts';

   export default defineA11yApp({
     remove: ['sync-engine'],
     add: [{ id: 'profile-sheet', overlay: true, path: '/home', auth: true, forms: ['personal'], open: openAccountSheet }],
   });
   ```

4. Remove what is left of the workspace: `git rm -r --ignore-unmatch a11y && rm -rf a11y`.
5. Read `git show main:cella/skills/screenshots/shots-config.mjs` beside `cella/screenshots.ts`, and write what differs
   into `cella/screenshots.app.ts` with `defineScreenshotsApp` from `@cellajs/cli/screenshots`: `add`, `remove`, `devices`,
   `format`, `suppress`, `placeholders`. A resolver takes the signed-in user, not `call`: build the SDK client with
   `apiClient(user)` from `./a11y.ts`. Then `git rm --ignore-unmatch cella/skills/screenshots/shots-config.mjs`.
6. In app scripts and docs: `pnpm a11y:run` and `pnpm a11y` become `pnpm cella a11y`, `pnpm -C a11y report` and
   `decide` become `pnpm cella a11y report` and `decide`, `node cella/skills/screenshots/shot-driver.mjs` becomes
   `pnpm cella shoot`, with `--out <dir>` for `OUT_DIR=` and `--email` for `EMAIL=`.
7. An app script that imports `session-lib.mjs` or `a11y/src/session.ts` imports `loadPlaywright`, `mintSession` and
   `signOut` from `@cellajs/cli/drive`: a session's `base` and `api` are `frontendUrl` and `backendUrl`.

## Verify

```sh
pnpm cella a11y --states sign-in,home
pnpm cella shoot <one shot id> --out /tmp/shots
pnpm check
```
