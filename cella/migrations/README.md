# Migrations

When an upstream cella change rewrites a pattern across the codebase (a codemod sweep, a schema
shift, a renamed contract), upstream code arrives already migrated but app-specific code still uses
the old pattern. Each folder here is a note that tells an app how to replay one such change after
a sync. The notes stay in this repo: the sync never copies this folder into an app, and apps read
the notes with `pnpm cella migrate`.

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

## For apps: applying migrations

The sync records the notes that arrive with it in the app-owned file `cella/cella.migrations.json`
(`{ "pending": [...] }`), and every sync run ends with a line such as
`migration notes: 94 of 97 handled · 3 open: pnpm cella migrate`. No file means nothing is pending.
Notes are information, not a gate: handle them in the sync PR or later; they stay listed until
recorded.

```sh
pnpm cella migrate                    # open notes, with summary and links
pnpm cella migrate --show <id>        # one note's README
pnpm cella migrate --extract <id>     # its folder under node_modules/.cache/cella/migrations/<id>/, to run the codemod
pnpm cella migrate --mark <id>        # record it as handled
```

For each note: run its codemod or work its manual steps, run the follow-ups in its **Verify**
section (`pnpm generate`, `pnpm sdk`, ...), gate on `pnpm check`, then mark it. The
[`migrate` skill](../skills/migrate/SKILL.md) drives this loop with an agent.

## For maintainers: authoring a migration

Ship the migration in the same PR as the breaking change:

1. Create `cella/migrations/<YYYYMMDDThhmm>-<slug>/README.md` from [`_TEMPLATE.md`](./_TEMPLATE.md)
   (`date -u +%Y%m%dT%H%M` for the prefix) plus the codemod / SQL / data files it needs. Nothing
   else to register.
2. Keep codemods entity-agnostic and driven by allow-lists or explicit maps, so apps extend them
   via a flag (e.g. `--extra-renames`) instead of editing the shipped script. Apps run the codemod
   from an extracted copy, so it must not import from other folders of this repo.

A `syncBreaking: true` change without a migration folder is what this system exists to prevent;
treat it like a missing `clientCacheVersion` bump.
