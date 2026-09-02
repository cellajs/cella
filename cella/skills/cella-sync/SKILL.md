---
name: cella-sync
description: Drive a pnpm cella sync or analyze for an app forked from the cella template. Covers conflict triage (pinned, both-added tests, fork markers), migration bookkeeping, silent auto-merge damage checks, and the drift decision matrix that keeps fork friction shrinking instead of growing.
---

# Cella sync for a forked app

Run whenever the app pulls the cella template: `pnpm cella sync` (merge) or `pnpm cella analyze`
(dry-run drift report). Every pass must leave the fork delta smaller or better-protected.

**Hard rule**: the CLI commits and ships the merge, never plain git. Each `pnpm cella sync` run
advances one stage; the run that commits never ships (steps 6 and 7).

## Vocabulary

- **fork-owned**: exists only in the app; sync never touches it. Preferred home for app code.
- **ignored / pinned**: `overrides` in `cella.config.ts`. Ignored: never synced. Pinned: fork side
  wins on conflict, upstream changes that merge cleanly still arrive.
- **fork marker**: `// fork: <why>` (css `/* fork: ... */`, md `<!-- fork: ... -->`) on every
  intentional app edit in a cella-owned file. JSON cannot carry markers: pin or ignore changed
  JSON files.

## 1. Preflight

1. Clean working tree, fresh branch (sync creates `cella/sync/<date>` itself).
2. Diff `cella/migrations/manifest.json` against the app's `cella.migrations.json` applied set
   and read each pending migration's README BEFORE resolving conflicts; conflicts usually belong
   to one of them.
3. Skim `git log --oneline <old>..cella-upstream/main`. Upstream commits that ADOPT this app's
   contributions come back as conflicts where ours = theirs + app payload.

## 2. Conflict triage

Resolve in this order; each resolution should make the NEXT sync cheaper.

| Conflict shape | Resolution |
|---|---|
| Pinned file (UU) | Fork side wins by config. Still diff against upstream; hand-adopt upstream-only improvements if cheap. |
| Both-added (AA) test or module, ours = upstream + app cases | Take upstream verbatim (`git checkout --theirs`); move the app cases to a fork-owned file beside its source (`<source>.test.ts` next to the fork's schema/module), never inside a cella-owned file. |
| Cella-owned file with fork markers (UU) | Take theirs, grep the pre-merge version (`git show :2:<file> \| grep -n -A2 'fork:'`), re-apply exactly the marked deltas with their markers. |
| Cella-owned file, no markers, unclear delta | Suspect accidental drift. Diff `:2:` vs `:3:`: no intentional axis on the fork side, take theirs; intentional, re-apply WITH a new `// fork:` marker. |
| Generated output (sdk/gen, routeTree.gen, openapi cache) | Take either side; regenerate at step 4. |

## 3. Silent-damage sweep

Auto-merge can drop fork lines in UNCONFLICTED files with no signal. After the merge, before
committing:

```sh
git diff HEAD --stat            # staged result vs pre-merge HEAD
git log -p MERGE_HEAD -1 --stat # what upstream intended
```

For each auto-merged file in an area with `fork:` markers (grep them repo-wide as the map), verify
the marked lines survived; CI stays green until typecheck when one is dropped.

## 4. Regenerate and gate

1. `pnpm generate` if any `*-db.ts` changed (drive the drizzle TTY prompt with expect; verify
   RENAME vs DROP+ADD in the generated SQL).
2. Before trusting typecheck, delete stale caches: `find . -name "*.tsbuildinfo" -not -path "*/node_modules/*" -delete`.
3. `pnpm check` until clean, then the test files touched by the merge plus the module suites of
   every area the sync altered.

## 5. Migration bookkeeping

`pnpm exec tsx cella/migrations/run.ts` prints the pending plan. Per entry:

- **Already satisfied** (the change originated here, or an earlier sync brought the code): verify
  the README's "Verify" steps pass, then mark.
- **To apply**: follow the README (the `migrate` skill drives the loop), gate on `pnpm check`,
  then mark.

Mark: `pnpm exec tsx cella/migrations/run.ts mark <id...>`. The pending list must be empty at the
end of a sync.

## 6. Commit, then drift triage

Step 1's run committed a clean merge; after conflict resolution, rerun `pnpm cella sync` to
commit. Never `git commit` the staged merge: a two-parent merge commit makes the squash-merged PR
list the entire upstream history. The CLI squash-commits the staged delta as a single-parent
commit and stops without pushing. (Pre-0.2.0 CLI: the commit rerun also ships; let it, then push
this triage as follow-ups to the open PR.)

Then `pnpm cella analyze` (diffs committed HEAD in a worktree; content reverts only show after
commit). Follow-up triage commits may use plain `git commit`; only the staged merge needs the
rerun. Per `drifted` file:

| Finding | Action |
|---|---|
| No fork marker, no known axis | Accidental drift: revert the file to upstream. |
| Generic improvement the app authored | Contribute upstream (`pnpm cella contributions`); do not protect. |
| App payload inside a cella-owned barrel/registry | Move the payload to a fork-owned file, import it directly, revert the barrel. |
| Real fork axis on a cella-owned file | Every delta gets a `// fork:` marker. Pin only after auto-merge has mangled the file at least once. |
| App identity (brand, locales, release config, root docs) | Add to `ignored` (never synced) or `pinned` (brand files that still want upstream fixes). |
| Fork axis shared by several files | Extension-point request: ask upstream for an empty stub file the fork fills and pins (setup-config / app-product-mocks pattern), then collapse the pins. |

Target state per sync: `diverged 0`, `behind 0`, every `drifted` file has a designated action, and
the pinned list did not grow except for documented scaffolding with an unwind condition.

## 7. Finish

Ship with `pnpm cella sync` (on a committed sync branch it flattens any merge commits, pushes, and
opens the PR). Never ship with plain `git push` + `gh pr create`: that skips the flatten safety
net. The same rerun repairs an existing bloated sync PR: it rewrites the branch to a single
commit with identical content and force-pushes with lease.

PR description: upstream range, conflicts and resolution shape, migrations marked, drift delta
(before/after analyze counts).
