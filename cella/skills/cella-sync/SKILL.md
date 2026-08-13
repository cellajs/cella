---
name: cella-sync
description: Drive a pnpm cella sync or analyze for an app forked from the cella template. Covers conflict triage (pinned, both-added tests, fork markers), migration bookkeeping, silent auto-merge damage checks, and the drift decision matrix that keeps fork friction shrinking instead of growing.
---

# Cella sync for a forked app

Run this flow whenever the app pulls the cella template: `pnpm cella sync` (merge) or
`pnpm cella analyze` (dry-run drift report). The goal of every sync is not just a green merge:
each pass should leave the fork delta smaller or better-protected than before.

**Hard rule**: on the sync branch, the merge is committed and shipped by the CLI, never by
plain git. Each `pnpm cella sync` run advances one stage and the run that commits never ships:
a clean merge is committed by the first run, a conflicted one by the rerun after resolution,
and a further rerun on the committed branch ships (push + PR). Why in step 6.

## Vocabulary

- **fork-owned**: file exists only in the app; sync never touches it. Preferred home for app code.
- **ignored / pinned**: `overrides` in `cella.config.ts`. Ignored is never synced; pinned prefers
  the fork side on conflict but still receives upstream changes that merge without conflict.
- **fork marker**: `// fork: <why>` comment (css `/* fork: ... */`, md `<!-- fork: ... -->`) on
  every intentional app edit inside a cella-owned file. JSON cannot carry markers, so a changed
  JSON file must be pinned or ignored.

## 1. Preflight

1. Clean working tree, on a fresh branch (sync creates `cella/sync/<date>` itself).
2. Read `cella/migrations/manifest.json` against the app's `cella.migrations.json` applied set:
   know which migrations this pull ships BEFORE resolving conflicts, and read each pending
   migration's README. Conflicts usually belong to one of those migrations.
3. Skim upstream history for the commits being pulled: `git log --oneline <old>..cella-upstream/main`.
   Watch for upstream commits that ADOPT this app's contributions; those round-trip back as
   conflicts where ours = theirs + app payload.

## 2. Conflict triage

Resolve in this order; every resolution should make the NEXT sync cheaper.

| Conflict shape | Resolution |
|---|---|
| Pinned file (UU) | Fork side wins by config. Still diff against upstream: adopt upstream-only improvements by hand if cheap. |
| Both-added (AA) test or module where ours = upstream + app cases | Take upstream verbatim (`git checkout --theirs`), move the app cases to a fork-owned file next to its source (`<source>.test.ts` beside the fork's schema/module). Never leave app cases woven into a cella-owned file. |
| Cella-owned file with fork markers (UU) | Take theirs, then grep the pre-merge version (`git show :2:<file> \| grep -n -A2 'fork:'`) and re-apply exactly the marked deltas, keeping their markers. |
| Cella-owned file, no markers, unclear delta | Suspect accidental drift. Diff `:2:` vs `:3:`; if the fork side has no intentional axis, take theirs. If intentional, re-apply WITH a new `// fork:` marker. |
| Generated output (sdk/gen, routeTree.gen, openapi cache) | Take either side; regenerate at step 4. |

## 3. Silent-damage sweep

Auto-merge can drop fork lines in UNCONFLICTED files without any signal. After the merge, before
committing:

```sh
git diff HEAD --stat            # staged result vs pre-merge HEAD
git log -p MERGE_HEAD -1 --stat # what upstream intended
```

For each auto-merged file in an area the fork customizes (grep `fork:` markers repo-wide as the
map), verify the marked lines survived. A dropped marker line is exactly how a required column or
registration disappears while CI stays green until typecheck.

## 4. Regenerate and gate

1. `pnpm generate` if any `*-db.ts` changed (drive the drizzle TTY prompt with expect; verify
   RENAME vs DROP+ADD in the generated SQL).
2. Delete stale incremental caches before trusting typecheck: `find . -name "*.tsbuildinfo" -not -path "*/node_modules/*" -delete`.
3. `pnpm check` until clean. Then run the test files touched by the merge, plus the module suites
   of any area the sync altered.

## 5. Migration bookkeeping

`pnpm exec tsx cella/migrations/run.ts` prints the pending plan. For each entry, one of:

- **Already satisfied** (the change originated in this app, or an earlier sync brought the code):
  verify the README's "Verify" steps pass, then mark.
- **To apply**: follow the README (the `migrate` skill drives the apply loop), gate on
  `pnpm check`, then mark.

Mark with `pnpm exec tsx cella/migrations/run.ts mark <id...>`. Never leave satisfied migrations
unmarked; the pending list must be empty at the end of a sync.

## 6. Commit, then drift triage

If the merge was clean, `pnpm cella sync` already committed it in step 1's run; after conflict
resolution, rerun `pnpm cella sync` to commit. Never commit the merge with plain `git commit`:
while the merge is staged, that records a two-parent merge commit, and because sync PRs are
squash-merged (upstream ancestry never reaches origin) the PR then lists the entire upstream
history — hundreds of commits, growing every release. The CLI instead squash-commits the staged
delta as a single-parent commit and stops on the branch without pushing, so it can be triaged
first. (Pre-0.2.0 CLI: the commit rerun also ships; let it, then do this triage as follow-up
pushes to the open PR.)

Then `pnpm cella analyze` (it diffs committed HEAD in a worktree, so content reverts only show
after commit). Follow-up commits from the triage are fine as plain `git commit` — only the
staged merge itself must go through the rerun. For every `drifted` file, apply the decision
matrix:

| Finding | Action |
|---|---|
| No fork marker, no known axis | Accidental drift: revert the file to upstream. |
| Generic improvement the app authored | Contribute upstream (`pnpm cella contributions`); do not protect. |
| App payload inside a cella-owned barrel/registry | Move the payload to a fork-owned file, import it directly, revert the barrel. |
| Real fork axis on a cella-owned file | Ensure every delta has a `// fork:` marker. Pin only after auto-merge has mangled the file at least once. |
| App identity (brand, locales, release config, root docs) | Add to `ignored` (never synced) or `pinned` (brand files that still want upstream fixes). |
| Fork axis that several files share | That is an extension-point request: ask upstream for an empty stub file the fork fills and pins (the setup-config / app-product-mocks pattern), then collapse the pins. |

Target state per sync: `diverged 0`, `behind 0`, every `drifted` file has a designated action, and
the pinned list did not grow except for documented scaffolding with an unwind condition.

## 7. Finish

Ship with `pnpm cella sync` (on a committed sync branch it flattens any merge commits, pushes,
and opens the PR). Never ship with plain `git push` + `gh pr create` — that skips the flatten
safety net, which is the last chance to catch a merge commit from step 6. If a bloated sync PR
already exists, the same rerun repairs it: it rewrites the branch to a single commit with
identical content and force-pushes with lease.

PR description lists: upstream range, conflicts and their resolution shape, migrations marked,
and the drift delta (before/after counts from analyze).
