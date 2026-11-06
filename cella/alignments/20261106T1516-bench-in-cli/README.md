---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: pnpm bench, bench/src/, bench/scenarios/, ../src/runner, ./runner/types, --filter bench, db:seed, db:teardown
---

# Load tests run with `pnpm cella bench`, from `backend/bench/`

`pnpm bench` is `pnpm cella bench`, and the `bench` workspace is gone. Its runner moved into `@cellajs/cli`; scenarios
import `defineScenario` and the runner's types from `@cellajs/cli/bench`. The app's bench code moved into the backend:
`bench/src/*.ts` to `backend/bench/`, `bench/src/seeds/` to `backend/bench/seeds/`, `bench/scenarios/` to
`backend/bench/scenarios/`, and `bench/src/bench-cli.ts` became `backend/bench/run.ts`. `pnpm --filter bench db:seed`
and `db:teardown` are `pnpm --filter backend bench:seed` and `bench:teardown`. Move the app's own bench files the
same way, and the pinned `attachment-home.ts` with its entry in `cella/cella.config.ts`.

## What & why

Every app carried the same runner, CLI glue and workspace. The runner, live output, baselines and lock now ship once
in `@cellajs/cli`; the app keeps its scenarios, seeds and checks in `backend/bench/`, where they import backend
modules by `#/`. `--isolated` runs a bench on `pnpm cella testbed`. The vitest `bench` project is gone with the
workspace: real runs are no unit test.

## Blast radius

Apps on the CLI release that ships `bench`. The upgrade moves the template's bench files; files an app added under
`bench/` stay behind, outside any workspace, so no typecheck sees them. No wire, cache or schema change.

## Run

No script: manual.

## Manual steps

1. Move the app's own scenarios into `backend/bench/scenarios/` (raak: `git mv bench/scenarios/cdc-throughput.ts bench/scenarios/task-edit.ts backend/bench/scenarios/`).
2. Move the app's own helpers from `bench/src/` into `backend/bench/` (raak: `task-edit-vu.ts`, `task-edits.ts`).
3. Move the app's own seeds from `bench/src/seeds/` into `backend/bench/seeds/` (raak: `label-id.ts`, `project.bench.ts`, `task.bench.ts`); their `../registry` and `./ids` imports stay as they are.
4. In the moved scenarios, import `defineScenario` from `@cellajs/cli/bench` in place of `../src/runner`, and drop `src/` from the other relative imports (`'../src/task-edit-vu'` becomes `'../task-edit-vu'`).
5. In the moved helpers, import runner types from `@cellajs/cli/bench` in place of `./runner/types` or `./runner/metrics` (raak: `type Vu` in `task-edit-vu.ts`).
6. Make `backend/bench/seeds/attachment-home.ts` the app's version: when the upgrade left it at `bench/src/seeds/attachment-home.ts`, move it over the upstream copy. Rename its pinned entry in `cella/cella.config.ts` to `backend/bench/seeds/attachment-home.ts`.
7. Remove what is left of `bench/`. Its ignored `bench/.baselines/` holds Artillery-era baselines no run compares: to keep them readable, move it to `.git/cella-bench/baselines/` while that folder does not exist yet; otherwise delete it.
8. Where `knip.jsonc`, `biome.jsonc` or `vitest.config.ts` carry the app's own lines next to the bench entries, check the merge: the `bench` workspace entry, project and globs go, and the backend entry lists `bench/run.ts`, `bench/scenarios/*.ts` and `bench/seeds/*.bench.ts`.
9. Replace `pnpm bench` with `pnpm cella bench`, and `pnpm --filter bench db:seed` with `pnpm --filter backend bench:seed`, in the app's own docs and scripts. Run `pnpm install`.

## Verify

`pnpm cella bench --help` lists the app's flags, and a scenario of the app's own runs on a testbed, such as raak's
`pnpm cella bench task-edit --short --isolated`.

```sh
pnpm check
```
