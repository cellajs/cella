---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: SignedIn, vocabularyAllowlist, VocabularyAllowlist, vocabulary-allowlist, mergePackageJson, releaseBase, maxErrorRate, skipSeed, openRepository, newContext, openPage, requireChromium, forkPath, CELLA_FORK_PATH, cella sync, align --run, align --show, align --mark, align --extract, audit --list
roots: cella, shared/config, backend/bench
---

# The app follows `@cellajs/cli` 0.8

Move the `settings` and `overrides` keys of `cella/cella.config.ts` to the top level, move
`shared/config/vocabulary-allowlist.ts` to `shared/config/style-exceptions.ts` as `styleExceptions: StyleExceptions`,
read `Session` and its `header` in `cella/*.app.ts`, write `maxErrorShare` and an argument-free `beforeAll` in the
app's own bench files, and call `align show`, `align run`, `align mark` and `audit fix` as jobs. The 0.7 config and
the old exceptions file keep loading with a warning until CLI 1.0, so an upgrade never stops on them.

## What & why

CLI 0.8 sets the interface 1.0 keeps. An upgrade meets it in this order:

1. The upgrade runs on the new CLI, which warns once about the config and once about the exceptions file.
2. `pnpm cella align` takes jobs: `show`, `run` and `mark` replace the flags.
3. `pnpm check` fails on `SignedIn` in `cella/*.app.ts` and on the bench options.
4. `pnpm cella audit` only reports; `pnpm cella audit fix` asks and writes.

## Blast radius

Every app on CLI 0.8. The base adapters (`cella/a11y.ts`, `pentest.ts`, `screenshots.ts`), the skill scripts and the
template's bench files arrive with the upgrade; the config, the exceptions file, the deltas and the app's own scenarios
do not. No database, wire or `clientCacheVersion` change.

## Run

The codemod moves the config keys with their comments and list order, renames `releaseBase` to `trunk`, drops
`mergePackageJson: true` and turns `false` into `packageJsonKeys: false`. It writes the exceptions file from the old
one and deletes that: `files` and `prefixes` exempt from `source-control-term`, `proseExclude` from each prose rule,
and each marker class keeps its reason as a comment.

In any file that imports `@cellajs/cli`, it renames `SignedIn` to `Session`, reads its `cookie` string as `header` and
the a11y base's `scope` as `states`, and passes `mintSession` a `repoRoot` for `forkPath`. In `backend/bench` it writes
`maxErrorShare`, the `errorShare` check id, an argument-free `beforeAll` and `rejected` for a failed `responses` check.
Files identical to the template's stay as they are, and it lists what it cannot change safely.

```sh
pnpm cella align run 20261114T1931-cli-0-8                                                # report only
pnpm cella align run 20261114T1931-cli-0-8 -- rewrite cella shared/config backend/bench   # apply
```

Add a root such as `scripts` when app scripts elsewhere import `@cellajs/cli`.

## Manual steps

1. Work each `by hand` line the codemod prints: a name the CLI no longer exports, `vu.ws`, `http.put`, `http.request`, a `beforeAll` that still reads `skipSeed`, a config key it could not move.
2. A base adapter it reports as still in the 0.7 shape is pinned or drifted: take the upgrade's version and port the app's edits to it.
3. In `cella/pentest.app.ts`, keep only the app's own `skip` and `scopeGuards` entries, which now join the base's, and list base entries the app lacks in `remove`.
4. In `shared/config/style-exceptions.ts`, drop the prose rules the old `proseExclude` paths never needed.
5. `pnpm cella style` counts a moved line as changed and reports a `, so` in a comment the codemod moved: make that sentence two.
6. In the app's own scripts, docs and CI, write `align show|run|mark <id>` for `align --show|--run|--mark <id>`, `audit` for `audit --list` and `audit fix` where `audit` should write; `align --extract` is gone, since `align run` writes the folder.
7. Replace `cella sync` with `cella upgrade` and drop `CELLA_FORK_PATH`: the CLI works on the checkout it runs in.
8. A script that reads the CLI's exit code takes 1 as a failed check or a step a person takes first, and 2 as a usage or runtime error.
9. A scenario threshold on `http.response_time` that budgeted SSE connects can come down: they record as `sse.connect_time`. The first full run writes a new baseline, since `cella-bench@1` entries are never compared.

## Verify

```sh
pnpm cella style   # no warning about cella/cella.config.ts or vocabulary-allowlist.ts
pnpm check
pnpm cella align   # the grep terms of this alignment no longer hit the app's files
```
