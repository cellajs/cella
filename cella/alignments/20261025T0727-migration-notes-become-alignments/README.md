---
breaking: false
clientCacheBump: false
grep: cella migrate, cella.migrations.json, cella/migrations, Migration-Note
---

# Migration notes become alignments

Upstream's migration notes are now alignments: `pnpm cella align` lists them and `pnpm cella migrate`
is gone, open ones are recorded in `cella/cella.alignments.json`, the `migrate` skill is now the
`align` skill, and the commit trailer that waives one is `Alignment: none, <reason>`. Template files
arrive renamed; change the app's own scripts, docs and prompts that use the old names.

## What & why

`cella/migrations/` became `cella/alignments/` and starts empty; the notes from before stay in git
history. "Migrate" also names the database migrations (`backend/drizzle`, `pnpm --filter backend
migrate`). Each alignment now says how its leftovers are caught (`caughtBy`), what to grep for
(`grep`) and whether it needs `pnpm generate`.

## Blast radius

Not breaking, no `clientCacheVersion` bump, no database change. Needs `@cellajs/cli` 0.5, which
the version gate asks for before the upgrade merges. An app whose own files never name the old command
or folder only marks this alignment.

## Run

No script: manual.

## Manual steps

1. Replace `pnpm cella migrate` with `pnpm cella align` and `Migration-Note:` with `Alignment:` in app-owned scripts, docs, commit templates and agent prompts.
2. A leftover `cella/cella.migrations.json` lists notes the app never handled: read each with `git show "$(git log -1 --format=%H --diff-filter=D cella-upstream/main -- cella/migrations)^:cella/migrations/<id>/README.md"`, work it, then delete the file.

## Verify

```sh
pnpm cella align   # no grep hits left for this alignment
pnpm check
```
