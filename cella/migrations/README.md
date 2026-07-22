# Migrations

When an upstream cella change rewrites a pattern across the codebase (a codemod sweep, a schema
shift, a renamed contract), upstream code arrives already migrated, but fork-specific code still
uses the old pattern. This folder ships the tooling and instructions to replay each such change on
a fork after pulling it.

## How it is structured

Three moving parts:

- **One folder per migration**, named `<YYYYMMDDThhmm>-<slug>` (UTC, minute precision). The
  timestamp is the stable id and the sort key: it orders migrations chronologically even under high
  merge activity, where a date alone collides. Each folder holds a `README.md` (from
  [`_TEMPLATE.md`](./_TEMPLATE.md)) and whatever the sweep needs (codemod script, data files, SQL).
- **[`manifest.json`](./manifest.json)** — the machine-readable index. One entry per folder,
  carrying its `version` (the cella release it ships in), `kind`, fork-breaking flag, codemod path,
  scan roots, and follow-up commands. This is what lets a tool or agent compute the pending set
  instead of eyeballing a prose list. Version lives here, never in the folder name, so a folder is
  never renamed after forks have run it.
- **[`run.ts`](./run.ts)** — the planner. It diffs `manifest.json` against the fork's applied-set
  and prints the migrations still to run, in order.

The applied-set is a fork-owned file, `cella.migrations.json` at the repo root, listing the ids a
fork has already run. Pending is a plain set difference (all declared ids minus applied ids), so it
works the same whether the fork tracks releases or a branch.

## For forks: applying migrations

After a `cella sync` pull, from the repo root:

```sh
pnpm exec tsx cella/migrations/run.ts          # print the pending plan, in order
```

Work the list top to bottom. For each migration: run its codemod (or follow the manual steps in its
`README.md`), run the follow-ups it lists (`pnpm generate`, `pnpm sdk`, …), gate on `pnpm check`,
then record it as applied:

```sh
pnpm exec tsx cella/migrations/run.ts mark <id>
```

The [`migrate` skill](../skills/migrate/SKILL.md) drives this whole loop with an agent; `run.ts
--json` feeds it the plan. Codemods are idempotent where possible: rerunning one against
already-migrated code should be a no-op.

## For maintainers: authoring a migration

Ship the migration in the same PR as the breaking change:

1. Create `cella/migrations/<YYYYMMDDThhmm>-<slug>/README.md` from [`_TEMPLATE.md`](./_TEMPLATE.md)
   (`date -u +%Y%m%dT%H%M` for the prefix). Add the codemod / SQL / data files it needs.
2. Add an entry to [`manifest.json`](./manifest.json). Set `version` to the target release, or
   `"next"` if unknown; backfill the real version when the release is cut.
3. Keep codemods entity-agnostic and driven by allow-lists or explicit maps, so forks extend them
   via a flag (e.g. `--extra-renames`) rather than editing the shipped script, which would conflict
   on the next sync.

A `forkBreaking: true` change without a migration folder is the thing this system exists to
prevent; treat it like a missing `clientCacheVersion` bump.
