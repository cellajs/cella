---
name: migrate
description: Apply pending cella upstream migrations to a fork after a sync. Computes the pending set from cella/migrations/manifest.json, runs each migration's codemod or manual steps in order, gates on pnpm check, and records what was applied.
---

# Applying cella migrations to a fork

Run this after a `cella sync` pull, or whenever `cella/migrations/run.ts` reports pending work.
The pipeline is **inventory → plan → transform → validate → ship**, one migration at a time, in
order. Never batch across migrations: apply, gate, record, then move to the next.

## 1. Inventory

From the repo root, get the pending plan as JSON:

```sh
pnpm exec tsx cella/migrations/run.ts --json
```

Each element has `id`, `title`, `kind`, `forkBreaking`, `clientCacheBump`, `script`, `roots`,
`requires`, `summary`. Address `warnings` (manifest/folder drift) before proceeding — they mean the
manifest and the folders disagree. If the list is empty, the fork is up to date; stop.

## 2. For each pending migration, in array order

Read `cella/migrations/<id>/README.md` in full first — it is the authority; the manifest is only a
summary. Then:

- **`kind: codemod` or `mixed`**: run the script in report mode first, read what it will touch, then
  apply:
  ```sh
  pnpm exec tsx <script> inventory <roots>   # or the exact command in the README
  pnpm exec tsx <script> rewrite   <roots>
  ```
  If the fork renamed or added entities, pass the migration's fork-extension flag (e.g.
  `--extra-renames fork-renames.json`); do not edit the shipped script.
- **`kind: sql`**: apply the SQL / run the drizzle regen exactly as the README's **Manual steps**
  and **Verify** sections describe. Answer drizzle rename prompts as instructed.
- **`kind: manual`**: work the numbered **Manual steps**. These are the ambiguous, per-file changes
  a codemod deliberately skips — apply them wherever the fork forked that surface.

Then run every command in `requires` (e.g. `pnpm generate`, `pnpm sdk`) and any follow-up the
README's **Verify** section lists (recalculation runbooks, seed steps).

## 3. Validate

Gate on the repo's single check:

```sh
pnpm check
```

If it fails, fix within the scope of this migration (or surface the blocker) before recording.
Never mark a migration applied over a red check.

## 4. Ship (record)

```sh
pnpm exec tsx cella/migrations/run.ts mark <id>
```

This appends the id to `cella.migrations.json` at the repo root so the migration drops out of future
plans. Commit that file alongside the migration's code changes. Then return to step 2 for the next
pending migration.

## Notes

- **Order matters.** Later migrations may assume earlier ones ran. Follow the array order; do not
  skip ahead.
- **Idempotency.** Codemods are no-ops on already-migrated code, so a rerun after a partial failure
  is safe. Manual and SQL steps may not be — read before re-running.
- **`forkBreaking: false`** migrations that an in-sync fork gets for free (compiler-enforced renames
  with no fork-specific surface) still get recorded once `pnpm check` is green, so the plan stays
  accurate.
