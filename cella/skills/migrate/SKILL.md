---
name: migrate
description: Apply pending cella upstream migrations to an app after a sync. Lists the open migration notes with pnpm cella migrate, runs each note's codemod or manual steps in order, gates on pnpm check, and records what was handled.
---

# Applying cella migrations to an app

Run after a `cella sync`, or whenever its closing line reports open migration notes. The notes
live upstream; `pnpm cella migrate` reads them from the upstream commit the app last synced to.
One note at a time, oldest first (later notes may assume earlier ones ran): apply, gate, record,
next. Open notes are a to-do list, not a gate: one left for later stays listed until it is marked.

## 1. Inventory

From the repo root:

```sh
pnpm cella migrate --json
```

`notes` carries the open notes, oldest first, each with `id`, `title`, `kind` (`codemod` or
`manual`), `syncBreaking`, `clientCacheBump`, `codemod`, `roots`, `summary` and `url` (a GitHub
permalink to its README). Empty list: up to date, stop.

## 2. For each open note, oldest first

Read the full README first (the list shows only its summary):

```sh
pnpm cella migrate --show <id>
```

- **`kind: codemod`**: extract the folder, then run report mode, read what it will touch, and
  apply. The README's `cella/migrations/<id>/` paths are the extracted folder:
  ```sh
  pnpm cella migrate --extract <id>
  pnpm exec tsx node_modules/.cache/cella/migrations/<id>/<codemod> inventory <roots>
  pnpm exec tsx node_modules/.cache/cella/migrations/<id>/<codemod> rewrite   <roots>
  ```
  If the app renamed or added entities, pass the note's customization flag (e.g.
  `--extra-renames app-renames.json`); never edit the extracted script.
  The roots hold template-owned files too, and upstream may have changed one after it wrote the
  codemod. Restore every rewritten file that had no app changes, or it becomes unmarked drift:
  ```sh
  upstream=$(node -p "require('./cella/cella.manifest.json').upstream.commit")
  git diff --name-only "$upstream" -- <roots> | sort > /tmp/app-changed   # before the rewrite
  # after it: a rewritten file that is not on the list goes back to upstream's version
  git diff --name-only -- <roots> | sort | comm -23 - /tmp/app-changed | while read -r file; do git checkout "$upstream" -- "$file"; done
  ```
- **Both kinds**: work the numbered **Manual steps** (per-file changes a codemod skips, SQL,
  drizzle regen, rename-prompt answers) wherever the app customized that code.

Then run every command and follow-up in the README's **Verify** section (`pnpm generate`,
`pnpm sdk`, recalculation runbooks, seed steps).

**Several schema notes in one sync make one migration.** Work the code steps of all of them first,
then generate once: `cd backend && pnpm tsx scripts/generate.ts --name <name> --hints '<array>'`,
where the array joins the notes' hints (a note's `hints.json`, or the hint in its steps). drizzle
orders the statements for the combined diff, not per note: move each note's hand-written
statements (its `data.sql`, or the template's `backend/drizzle/<folder>/migration.sql` at the
upstream commit) to where the note says, such as after an `ADD COLUMN` and before the `DROP` it
feeds. A second generate must report no changes.

## 3. Validate

```sh
pnpm check
```

On failure, fix within this note's scope (or report the blocker) before recording. Never mark a
note handled over a red check.

## 4. Record

```sh
pnpm cella migrate --mark <id>
```

Removes the id from `cella/cella.migrations.json` (the file goes once the list is empty). Commit
that change with the note's code changes, then return to step 2 for the next note.

## Notes

- **Idempotency.** Codemods are no-ops on migrated code, so a rerun after a partial failure is
  safe. Manual and SQL steps may not be; read before re-running.
- **`syncBreaking: false`** notes an in-sync app gets for free (compiler-enforced renames, no
  app-specific surface) are still marked once `pnpm check` is green, so the list stays accurate.
