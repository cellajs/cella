---
name: migrate
description: Apply pending cella upstream migrations to an app after a sync. Computes the pending set from cella/migrations/manifest.json, runs each migration's codemod or manual steps in order, gates on pnpm check, and records what was applied.
---

# Applying cella migrations to an app

Run after a `cella sync` pull, or whenever `cella/migrations/run.ts` reports pending work.
Pipeline: **inventory → plan → transform → validate → ship**, one migration at a time, in array
order (later migrations may assume earlier ones ran). Never batch or skip ahead: apply, gate,
record, next.

## 1. Inventory

From the repo root:

```sh
pnpm exec tsx cella/migrations/run.ts --json
```

Elements carry `id`, `title`, `kind`, `syncBreaking`, `clientCacheBump`, `script`, `roots`,
`requires`, `summary`. Address `warnings` (manifest and folders disagree) first. Empty list: up to
date, stop.

## 2. For each pending migration, in array order

Read `cella/migrations/<id>/README.md` in full first (the manifest is only a summary). Then:

- **`kind: codemod` or `mixed`**: report mode first, read what it will touch, then apply:
  ```sh
  pnpm exec tsx <script> inventory <roots>   # or the exact command in the README
  pnpm exec tsx <script> rewrite   <roots>
  ```
  If the app renamed or added entities, pass the migration's customization flag (e.g.
  `--extra-renames app-renames.json`); never edit the shipped script.
- **`kind: sql`**: follow the README's **Manual steps** and **Verify** sections exactly (SQL,
  drizzle regen, rename-prompt answers).
- **`kind: manual`**: work the numbered **Manual steps** (per-file changes a codemod skips)
  wherever the app customized that code.

Then run every command in `requires` (e.g. `pnpm generate`, `pnpm sdk`) and every follow-up in
the README's **Verify** section (recalculation runbooks, seed steps).

## 3. Validate

```sh
pnpm check
```

On failure, fix within this migration's scope (or report the blocker) before recording. Never
mark a migration applied over a red check.

## 4. Ship (record)

```sh
pnpm exec tsx cella/migrations/run.ts mark <id>
```

Appends the id to `cella/cella.migrations.json`. Commit that file with the migration's code
changes, then return to step 2 for the next migration.

## Notes

- **Idempotency.** Codemods are no-ops on migrated code, so a rerun after a partial failure is
  safe. Manual and SQL steps may not be; read before re-running.
- **`syncBreaking: false`** migrations an in-sync app gets for free (compiler-enforced renames, no
  app-specific surface) are still recorded once `pnpm check` is green, so the plan stays accurate.
