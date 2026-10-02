# Migrations

When an upstream cella change rewrites a pattern across the codebase (a codemod sweep, a schema
shift, a renamed contract), upstream code arrives already migrated but app-specific code still uses
the old pattern. This folder ships the tooling and instructions to replay each change on an app
after pulling it.

## How it is structured

- **One folder per migration**, named `<YYYYMMDDThhmm>-<slug>` (UTC, minute precision). The
  timestamp is the stable id and sort key; a date alone collides under high merge activity. Each
  folder holds a `README.md` (from [`_TEMPLATE.md`](./_TEMPLATE.md)) and whatever the sweep needs
  (codemod script, data files, SQL).
- **The README describes the migration.** Its frontmatter carries `syncBreaking`,
  `clientCacheBump` and, beside a codemod, the codemod's `roots`; the title and the paragraph under
  it are the summary. The codemod is the one non-test `.ts` file in the folder. There is no
  central index, so two PRs that each add a migration never conflict. `pnpm style` checks the
  shape.
- **[`run.ts`](./run.ts)**: the planner. It reads the folders, diffs them against the app's
  applied-set and prints the migrations still to run, in order.

The applied-set is the app-owned file `cella/cella.migrations.json`, listing the ids already run.
Pending is a plain set difference, so it works the same whether the app tracks releases or a branch.
A new app has no applied-set: the first `run.ts` run records every migration already on disk as
applied, because the scaffold's code holds them all. Run it before the app's first sync merges.

## For apps: applying migrations

After a `cella sync` pull, from the repo root:

```sh
pnpm exec tsx cella/migrations/run.ts          # print the pending plan, in order
```

Work the list top to bottom. For each migration: run its codemod (or the manual steps in its
`README.md`), run the follow-ups it lists (`pnpm generate`, `pnpm sdk`, ...), gate on `pnpm check`,
then record it:

```sh
pnpm exec tsx cella/migrations/run.ts mark <id>
```

The [`migrate` skill](../skills/migrate/SKILL.md) drives this loop with an agent; `run.ts --json`
feeds it the plan.

## For maintainers: authoring a migration

Ship the migration in the same PR as the breaking change:

1. Create `cella/migrations/<YYYYMMDDThhmm>-<slug>/README.md` from [`_TEMPLATE.md`](./_TEMPLATE.md)
   (`date -u +%Y%m%dT%H%M` for the prefix) plus the codemod / SQL / data files it needs. Nothing
   else to register.
2. Keep codemods entity-agnostic and driven by allow-lists or explicit maps, so apps extend them
   via a flag (e.g. `--extra-renames`) instead of editing the shipped script, which would conflict
   on the next sync.

A `syncBreaking: true` change without a migration folder is what this system exists to prevent;
treat it like a missing `clientCacheVersion` bump.
