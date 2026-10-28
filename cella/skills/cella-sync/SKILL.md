---
name: cella-sync
description: Drive a pnpm cella sync or analyze for an app forked from the cella template. Covers conflict triage (pinned, both-added tests, fork markers), alignment bookkeeping, silent auto-merge damage checks, and the drift decision matrix that keeps fork friction shrinking instead of growing.
---

# Cella sync for a forked app

Run whenever the app pulls the cella template: `pnpm cella sync` (merge) or `pnpm cella analyze`
(dry-run drift report).

**Hard rule**: the CLI commits and ships the merge, never plain git. Each `pnpm cella sync` run
advances one stage (steps 6 and 7).

## Vocabulary

- **fork-owned**: exists only in the app; sync never touches it. Preferred home for app code.
- **ignored / pinned**: `overrides` in `cella.config.ts`. Ignored: never synced. Pinned: the app copy
  always wins; the CLI restores every changed pinned file to HEAD right after the merge, so no upstream
  hunk merges in and a pinned file never conflicts. Adopt upstream hunks by hand from the analyze list
  ("protected but behind upstream").
- **fork marker**: `// fork: <why>` (css `/* fork: ... */`, md `<!-- fork: ... -->`, a ` * fork: ...` line in JSDoc, YAML `# fork: ...`) on every
  intentional app edit in a cella-owned file, one marker per contiguous edit, naming the
  customization axis, not the diff; unmarked drift counts as accidental. JSON cannot carry
  markers: pin or ignore changed JSON files.

## 1. Preflight

1. Clean working tree, fresh branch (sync creates `cella/sync/<date>` itself). A run that stops with
   `upstream needs @cellajs/cli ...` has changed nothing: run the `pnpm add` it prints, commit, rerun.
   The sync bumps the CLI itself, so the merge runs on the version installed before it. Compare
   `pnpm cella --version` with the `@cellajs/cli` range in upstream's root `package.json`
   (`git fetch cella-upstream && git show cella-upstream/main:package.json | grep @cellajs/cli`) and
   install the newer one first: a CLI before 0.3 has no such stop and merges with the old rules.
2. The merge uses `cella/cella.config.ts` as it stands, and that file never syncs. Before the first
   run, read `git diff <last sync commit>..cella-upstream/main -- cella/cella.config.ts` (the commit is
   `upstream.commit` in `cella/cella.manifest.json`) and copy the `ignored`, `pinned` and
   `packageJsonSync` entries that fit the app, then commit. A path upstream newly ignores arrives
   as ordinary synced files otherwise.
3. Once the first run has merged, read the alignments that arrived (`pnpm cella align`, steps 1 and 2
   of the `align` skill) BEFORE resolving conflicts; conflicts usually belong to one of them.
4. Skim `git log --oneline <old>..cella-upstream/main`. Upstream commits that ADOPT this app's
   contributions come back as conflicts where ours = theirs + app payload.

## 2. Conflict triage

Resolve in this order. Pinned files never conflict (see Vocabulary).

| Conflict shape | Resolution |
|---|---|
| Both-added (AA) test or module, ours = upstream + app cases | Take upstream verbatim (`git checkout --theirs`); move the app cases to an app-owned companion beside its source (`<source>-app.test.ts`; the style check flags the word fork in file names), never inside a cella-owned file. |
| Cella-owned file with fork markers (UU) | Take theirs, grep the pre-merge version (`git show :2:<file> \| grep -n -A2 'fork:'`), re-apply exactly the marked deltas with their markers. |
| Cella-owned file, no markers, unclear delta | Suspect accidental drift. Diff `:2:` vs `:3:`: no intentional axis on the fork side, take theirs; intentional, re-apply WITH a new `// fork:` marker. |
| Generated output (sdk/gen, routeTree.gen, openapi cache) | Take either side; regenerate at step 4. |

## 3. Silent-damage sweep

Auto-merge can drop fork lines in UNCONFLICTED files with no signal. Sweep after the merge, before
shipping. With conflicts open the merge is still staged; a clean first run has already committed it
(step 6), so both sides of the comparison move:

```sh
# conflicts open: the merge is staged, upstream is MERGE_HEAD
git diff HEAD --stat             # staged result vs pre-merge HEAD
git log -p MERGE_HEAD -1 --stat  # what upstream intended

# clean run: the sync is committed, upstream is the commit the manifest records
upstream=$(node -p "require('./cella/cella.manifest.json').upstream.commit")
git diff HEAD~1 --stat           # sync commit vs pre-merge HEAD
git log -p "$upstream" -1 --stat # what upstream intended
```

For each auto-merged file in an area with `fork:` markers (grep them repo-wide as the map), verify
the marked lines survived; CI stays green until typecheck when one is dropped.

Ignored and pinned paths never merge, so upstream changes there arrive only by hand. Read what
upstream changed since the last sync, as a range: `git diff <last sync commit>..<upstream> -- shared/config`
(`MERGE_HEAD` or `$upstream`, as above; the run prints this command for some paths). The form
`git diff HEAD <upstream>` shows the app's whole copy against the template's, which hides the change.
Do the same for every pinned path and every app-owned module folder (`owner: 'app'`) that started as
an upstream module. A changed export there shows up as type errors in synced files. The reference
modules (`backend/src/modules/attachment`, `organization` and their `frontend/src/modules` twins)
get the same range diff: app modules copied their patterns, and an alignment names only what breaks.

## 4. Regenerate and gate

1. `pnpm generate` if any `*-db.ts` changed (drive the drizzle TTY prompt with expect; verify
   RENAME vs DROP+ADD in the generated SQL).
2. `pnpm generate:routes` if the sync added, moved or removed a route file: `routeTree.gen.ts` is
   app-owned and only regenerates from Vite or this script.
3. Before trusting typecheck, delete stale caches: `find . -name "*.tsbuildinfo" -not -path "*/node_modules/*" -delete`.
4. `pnpm check` until clean, then the root `pnpm test` (full mode, what CI runs: a package's own
   `pnpm test` runs core mode and skips integration suites such as yjs), `pnpm test:storybook`,
   `pnpm unused` and `pnpm --filter frontend build`.

## 5. Alignment bookkeeping

Run the [align skill](../align/SKILL.md). An alignment whose change originated in this app or arrived
by an earlier sync is verified and marked, not re-applied.

## 6. Commit, then drift triage

The CLI runs `pnpm install` and `pnpm check` before it commits the merge. A run whose check fails
stops with the merge staged, so sync-breaking alignments that break the check are worked before the
first commit; after fixing (and after conflict resolution), rerun `pnpm cella sync` to commit.
Never `git commit` the staged merge: a two-parent merge commit makes the squash-merged PR list the
entire upstream history. The CLI squash-commits the staged delta as a single-parent commit and
stops without pushing.

Then `pnpm cella analyze` (diffs committed HEAD in a worktree; content reverts only show after
commit; `--json` lists `{ path, status }` per file). Follow-up triage commits may use plain
`git commit`; only the staged merge needs the rerun. Per `drifted` file:

| Finding | Action |
|---|---|
| No fork marker, no known axis | Accidental drift: revert the file to upstream. |
| Generic improvement the app authored | Contribute upstream; do not protect. Nothing to run in the app: the template maintainers adopt it from the app's trunk with `pnpm cella contributions`, a template-side command that needs `forks` in the config. |
| App payload inside a cella-owned barrel/registry | Move the payload to a fork-owned file, import it directly, revert the barrel. |
| Real fork axis on a cella-owned file | Every delta gets a `// fork:` marker. Pin only after auto-merge has mangled the file at least once. |
| App identity (brand, locales, release config, root docs) | Add to `ignored` (never synced) or `pinned` (brand files whose upstream fixes you adopt by hand). |
| Fork axis shared by several files | Extension-point request: ask upstream for an empty stub file the fork fills and pins (setup-config / app-product-mocks pattern), then collapse the pins. |

Target state per sync: `diverged 0`, `behind 0`, every `drifted` file has a designated action, and
the pinned list did not grow except for documented temporary pins with an unwind condition.

## 7. Finish

Ship with `pnpm cella sync` (on a committed sync branch it flattens any merge commits, pushes, and
opens the PR). Never ship with plain `git push` + `gh pr create`: that skips the flatten safety
net. The same rerun repairs an existing bloated sync PR: it rewrites the branch to a single
commit with identical content and force-pushes with lease.

PR description: upstream range, conflicts and resolution shape, the align skill's outcome table,
drift delta (before/after analyze counts).
