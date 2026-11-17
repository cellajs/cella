---
name: align
description: Apply pending cella upstream alignments to an app after an upgrade. Lists the open alignments with pnpm cella align, runs each one's codemod or manual steps in order, reads the app code typecheck cannot judge, gates on pnpm check, records what was handled, reads the upgrade's commits to the reference modules for patterns no alignment names, and reports each outcome in the upgrade PR.
---

# Aligning an app with upstream cella

Run after a `pnpm cella upgrade`, or whenever its closing line reports open alignments. Alignments
live upstream; `pnpm cella align` reads them from the upstream commit the app last upgraded to. One
at a time, oldest first (later ones may assume earlier ones ran): apply, gate, record, next. Open
alignments are a to-do list, not a gate: one left for later stays listed until it is marked.

## 1. Inventory

From the repo root:

```sh
pnpm cella align --json
```

`alignments` carries the open ones, oldest first, each with `id`, `title`, `summary`, `kind`
(`codemod` or `manual`), `breaking`, `clientCacheBump`, `caughtBy` (`compiler`, `tests` or
`nothing`), `generate`, `grep` and `grepHits` (`{ file, line }` in the app's own and changed
files), `codemod`, `roots`, `url` (its README), `pr` and `prUrl` (the upstream PR that added it),
`sharedCommit` (other alignments from that PR) and `yourFiles` (files that PR changed which the app
pins, ignores or changed). Empty list: up to date, go to step 5.

## 2. For each open alignment, oldest first

Read the full README first (the list shows only its summary). Before the upgrade has merged, `align show`
reads the id from the fetched upstream:

```sh
pnpm cella align show <id>
```

- **`kind: codemod`**: report, read what it will touch, then apply. Files identical to upstream
  stay as they are, so the rewrite only reaches code the app owns or changed:
  ```sh
  pnpm cella align run <id>                      # report over the README's roots
  pnpm cella align run <id> -- rewrite <roots>   # apply
  ```
  If the app renamed or added entities, pass the README's customization flag after `--` (e.g.
  `--extra-renames app-renames.json`); never edit the extracted script.
- **Both kinds**: work the numbered **Manual steps** wherever the app customized that code.
- **`yourFiles`**: the sync brought none of upstream's change to these files into the app's
  version (pinned, ignored), or merged it into an app edit. Read the PR's change per file
  (`git show <commit> -- <file>`) and port what applies.
- **`caughtBy: nothing`**: a green `pnpm check` proves nothing here. Open every grep hit and the
  app's own queries, parsers and tests near the changed behavior, and fix what still follows the
  old one (an app list query that joins memberships itself, a runtime zod parse of a reshaped
  field). For `caughtBy: tests`, the root `pnpm test` (full mode) is the check.

Then run every command and follow-up in the README's **Verify** section (`pnpm generate`,
`pnpm sdk`, recalculation runbooks, seed steps).

**Several schema alignments in one sync make one migration.** The list groups the open ones with
`generate: true`. Work the code steps of all of them first, then generate once:
`cd backend && pnpm tsx scripts/generate.ts --name <name> --hints '<array>'`, where the array joins
the alignments' hints (an alignment's `hints.json`, or the hint in its steps). drizzle orders the
statements for the combined diff, not per alignment: move each one's hand-written statements (its
`data.sql`, or the template's `backend/drizzle/<folder>/migration.sql` at the upstream commit) to
where its README says, such as after an `ADD COLUMN` and before the `DROP` it feeds. A second
generate must report no changes.

## 3. Validate

```sh
pnpm check
```

On failure, fix within this alignment's scope (or report the blocker) before recording. Never mark
an alignment handled over a red check.

## 4. Record

```sh
pnpm cella align mark <id>
```

Removes the id from `cella/cella.alignments.json` (the file goes once the list is empty). Commit
that change with the alignment's code changes, then return to step 2 for the next one.

## 5. Read the reference modules

An alignment reports what breaks, and an addition breaks nothing: a prop the template's page starts
to pass, a permission it starts to ask, a helper its query moves to. The app's own product and
channel modules copied these patterns from `attachment` (product) and `organization` (channel).
Read every commit of the upgrade that changed those two modules:

```sh
old=$(git show origin/main:cella/cella.manifest.json | node -p "JSON.parse(require('fs').readFileSync(0, 'utf8')).upstream.commit")
new=$(node -p "require('./cella/cella.manifest.json').upstream.commit")
repo=$(node -p "require('./cella/cella.manifest.json').upstream.repo")
git log --reverse --format='%h %s' "$old..$new" -- {backend,frontend}/src/modules/{attachment,organization}
git show <hash> -- {backend,frontend}/src/modules/{attachment,organization}  # its change
gh pr view <number> --repo "$repo" --json body --jq .body                    # its why: the (#number) in the subject
git grep -n <identifier> "$new" -- cella/alignments                          # the alignments that name it
```

An empty list ends the step. An app-owned module (`owner: 'app'`) whose entity
`shared/config/hierarchy-config.ts` declares with `.product` is the twin of `attachment`, one
declared with `.channel` the twin of `organization`; files pair by role with the name swapped
(`attachment-queries.ts` and `<name>-queries.ts`, `organization-page.tsx` and `<name>-page.tsx`).

- **Order**: commits without `!` in the subject first, since no alignment covers them. Then each `!`
  commit, for what no alignment names: grep the alignments for each identifier its diff changes. A
  change a later commit in the range rewrites is checked once, against the template file at `$new`.
- **Skip**: a commit or hunk that changes only tests, stories or comments, and a change with no
  counterpart in the app, such as attachment's file handling or what the organization does as the
  spine (tenants, the lobby).
- **Finding**: a pattern change the twin has not followed, confirmed by opening the app file; grep
  the app's other modules of that kind for the same old form. Not a finding: what typecheck
  reports, what an alignment's steps cover, a twin that reaches the same result under its own name.
- **Act**: apply a mechanical finding (a missing prop, a swap to the template's helper) in the
  upgrade PR, gated by `pnpm check`. One that needs a decision (a change users see, a style change
  across many files) goes in the PR description (step 6).
- **Where it bites**: the app file and the template file at `$new` can look nearly the same, and
  only the diff shows that the template added something on purpose. An alignment finds the old form
  by its name, and a twin that wrote the same behavior another way shows only in the reference diff.

## 6. Report outcomes

Once the upgrade PR exists, add one table to its description with a row per alignment that arrived
with this upgrade, handled or not. Upstream reads these tables to learn which alignments were
precise, so fill it also when every row says `nothing`.

| Column | Value |
|---|---|
| alignment | the id |
| outcome | `nothing` (marked with no change), `config` (app-owned config or a cache bump only), `generate` (a regenerate only), `code` (app code changed), `open` (left for later) |
| missed | what the app had to do that the README did not say, or `-` |

Under the table, list the findings of step 5, applied or open, one line each: the upstream commit,
the template file, the app file and the change. Upstream reads a finding from a `!` commit as a
step its alignments missed.

The arrived ids are the alignments upstream added between the app's previous upgrade and this
one. `gh pr edit` does not update a description reliably, and not at all from a cloud session, so
write it through the REST API:

```sh
old=$(git show origin/main:cella/cella.manifest.json | node -p "JSON.parse(require('fs').readFileSync(0, 'utf8')).upstream.commit")
new=$(node -p "require('./cella/cella.manifest.json').upstream.commit")
git diff --name-only --diff-filter=A "$old" "$new" -- cella/alignments | grep README.md
gh api repos/{owner}/{repo}/pulls/<number> --jq .body > /tmp/body.md   # then append the table and the findings
gh api -X PATCH repos/{owner}/{repo}/pulls/<number> -F body=@/tmp/body.md
```

## Notes

- **Idempotency.** Codemods are no-ops on aligned code, so a rerun after a partial failure is
  safe. Manual and SQL steps may not be; read before re-running.
- **`breaking: false`** alignments an up-to-date app gets for free (compiler-enforced renames, no
  app-specific code involved) are still marked once `pnpm check` is green, so the list stays
  accurate.
- **Before alignments.** An app whose last upgrade predates `cella/alignments/` reads the migration notes
  that preceded them at the commit before they were removed:
  ```sh
  git show "$(git log -1 --format=%H --diff-filter=D cella-upstream/main -- cella/migrations)^:cella/migrations/<id>/README.md"
  ```
