# Jujutsu (jj) VCS — Assessment for Cella template fork design

> **TL;DR**: jj's first-class conflicts, automatic rebasing, and Git-compatible backend map
> remarkably well to the pain points of Cella's fork sync workflow. If the goal is to reduce
> long-term CLI complexity, the cleanest direction is a **jj-only Cella CLI** with Git used only
> at the remote interoperability boundary (GitHub push/pull), not as an internal execution path.

---

## 1. What the Cella CLI currently does

The `cli/cella` package implements a three-way upstream-sync strategy for forks of the Cella
template:

| Concept | Implementation |
|---------|---------------|
| Fetch upstream | `git fetch cella` via `ensureRemote` + `fetch` helpers |
| Find merge base | `getEffectiveMergeBase` — locates last stored sync ref or common ancestor |
| Pre-analyze | `analyzeFiles` — diffs upstream vs fork using plumbing (`ls-tree`, `diff-tree`) without touching the working tree |
| Pinned files | Files that fork has diverged from upstream intentionally; always restored to fork's version |
| Ignored files | Files the fork doesn't want at all; removed from merge result |
| Sync (apply) | `git merge --no-commit` in fork, batch-restore pinned/ignored files, leave conflicts for IDE |
| Worktree | Used for dry-run analysis only; discarded after |
| Conflict handling | Git merge markers land in working tree for IDE three-way resolution |

The CLI is entirely built on top of vanilla `git` plumbing. Its complexity comes from
compensating for Git's lack of first-class conflict objects, no automatic descendant rebasing,
and difficulty tracking "this file is intentionally diverged" across merge-base evolution.

---

## 2. What jj brings to that problem space

### 2.1 First-class conflicts

In jj, a conflict is a first-class value stored in the commit object itself — not an
interrupted operation. Consequences:

- `jj rebase` never fails due to conflicts; the conflict is carried forward in the rebased commit.
- Resolving a conflict in an ancestor automatically propagates the resolution to descendants.
- No equivalent of `git merge --no-commit` limbo state to manage.

**Direct relevance**: The current CLI leaves the fork in a `MERGE_HEAD` state so that IDEs get
proper three-way merge tooling. In a jj-native flow the fork would simply have a commit with
conflict markers, which the developer resolves at leisure with no interrupted operation state.
The batch-restore logic for pinned/ignored files (which exists partly to minimise the window
where the IDE sees bad state) would be simpler: it would be a `jj restore` / file edit in the
conflicted commit, not a race against the IDE's file-watcher.

### 2.2 Automatic descendant rebasing

When a commit is rewritten in jj, all descendants are automatically rebased on top of the new
commit. This maps directly to the "keep fork synced" use case:

```
upstream: A -- B -- C -- D (latest)
fork:      A -- B -- X -- Y  (fork commits on top of last sync point B)
```

With git the CLI runs `git merge cella/main`, which creates a merge commit. Over time this
produces a fan-shaped history that obscures what the fork actually changed vs what came from
upstream. With jj one would instead:

```
jj rebase -s X --destination D
```

This produces:

```
upstream: A -- B -- C -- D
fork:                    D -- X' -- Y'
```

A clean linear history where the fork's customisations are always commits on top of the latest
upstream. No merge commit noise.

### 2.3 Operation log and undo

Every mutating jj operation is recorded in an operation log. `jj op undo` undoes the last
operation atomically. This removes the need for the CLI's "last sync ref" bookkeeping
(`storeLastSyncRef` / `getStoredSyncRef`) which currently stores the upstream commit hash in
`.git/cella-sync-ref` as a manual safety net.

### 2.4 No staging area

The CLI currently requires the fork to be clean before syncing (`isClean` check) because
`git merge` would fail on a dirty working tree. jj has no index and automatically commits the
working copy, so there is no concept of "dirty" to guard against. The preflight check
`preflightFork` would become much simpler.

### 2.5 Bookmarks (branches) are not HEAD-tracking

In jj, bookmarks must be moved explicitly — there is no auto-advancing branch pointer. For the
multi-fork `forks` service this is neutral-to-positive: each fork repo manages its own bookmark
on the upstream sync point, which is exactly the current model but with stricter semantics.

---

## 3. How jj should be integrated into the Cella CLI (jj-only)

For a jj-only CLI, replace the `git merge --no-commit` + batch-restore flow with:

```ts
// pseudo-code
await jj(['rebase', '-s', forkFirstCommit, '--destination', upstreamRef], forkPath);
// then restore pinned/ignored files as before
```

Core outcomes:
- No MERGE_HEAD state left in the repo.
- Conflicts are committed objects, not interruptions.
- History is linear and readable.
- `jj op undo` replaces manual rollback logic.

Key constraints:
- Requires fork maintainer to use jj (or at least have it installed).
- jj's colocated mode writes to `.git` but jj metadata is in `.jj/` — CI pipelines and GitHub
  Actions must tolerate this.
- Hook-based automation (lefthook) works unchanged because jj still fires git hooks in
  colocated mode.

---

## 4. Mapping current CLI pain points to jj solutions

| Pain point | Current workaround | jj solution |
|---|---|---|
| Fork must be clean before sync | `isClean` preflight throws | No concept of dirty; working copy IS a commit |
| Merge leaves MERGE_HEAD state | Left intentionally for IDE | Conflicts stored in commit; no interrupted op |
| Pinned files can flicker in IDE | Batch-restore immediately after merge | Edit conflict commit directly; no race window |
| "Last sync ref" stored in `.git/cella-sync-ref` | Custom bookkeeping | jj operation log is the source of truth |
| Merge-base detection across squash merges | `getEffectiveMergeBase` heuristic | `jj log -r 'latest(ancestors(fork) & ancestors(upstream))'` |
| History polluted with sync merge commits | Accepted as-is | `jj rebase` keeps history linear |
| Manual conflict count per file | Parse `getConflictedFiles` output | `jj resolve --list` |
| Rename tracking across sync | `gitMv` + `getFileChanges` | `jj diff --summary` includes copy/rename info natively |

---

## 5. Risks and counter-arguments

### 5.1 Developer adoption barrier

jj is still pre-1.0 (v0.40 as of April 2026). Requiring fork maintainers to learn a new VCS is
a significant ask. The colocated mode mitigates this because `git` commands still work, but over
time teams will diverge in which they use primarily, creating confusion.

### 5.2 Tool ecosystem gaps

- No native GitHub PR creation from jj (must `git push` then use `gh`).
- Some CI services inspect `.git/` directly — the `.jj/` directory alongside it is opaque.
- Lefthook, husky and similar hook runners work fine, but jj's hook semantics are slightly
  different (hooks fire per working-copy snapshot, not per explicit stage).

### 5.3 Mandating jj changes onboarding economics

The CLI can require jj, but doing so shifts cost from maintainers to adopters. Teams with
Git-only habits will face initial migration friction and require explicit setup support.

### 5.4 Conflict propagation could surprise fork authors

jj's automatic rebase means that resolving a conflict in commit X automatically updates all
descendants. This is a feature, but it can be unintuitive: a developer resolving what appears to
be a local conflict may silently affect other in-progress commits.

---

## 6. Verdict and recommendation

jj is a genuinely good fit for the conceptual problem Cella solves. The fork-sync workflow is
essentially "keep a set of divergent commits rebased onto a moving upstream base", which is
exactly what jj's automatic-rebase + first-class-conflict model is optimised for.

**Recommended approach**:

1. **Set the product direction**: Cella CLI is jj-only for local VCS operations.
2. **Enforce preflight**: startup fails fast if `jj` is missing and provides exact install steps.
3. **Simplify engine**: remove git backend branches and keep a single jj execution path.
4. **Preserve interoperability**: continue using GitHub/Git remotes as transport boundaries.

---

## 6.1 Can jj be included at CLI install time?

Short answer: **partly, yes**, but there are important constraints.

### What is technically possible

1. **Global npm package executable**

   Yes. `@cellajs/cli` can be published as a proper executable package (`pnpm add -g @cellajs/cli`
   or `npx @cellajs/cli`). This is independent from jj itself.

2. **Install-time detection and guidance**

   Yes. During first run (or via `cella doctor`), detect `jj` in `PATH` and print exact install
   commands (`brew install jj`, `winget install jj-vcs.jj`, etc.). This is low risk and reliable.

3. **Install-time auto-bootstrap via package managers**

   Possible but fragile. A Node postinstall script can attempt to run Homebrew/apt/winget/choco,
   but this often fails in CI, non-interactive shells, locked corporate environments, or when
   privilege escalation is needed.

4. **Bundling jj binaries inside npm package**

   Technically possible but not recommended: very large package size, platform/arch matrix
   complexity, security scanning burden, and slower releases when jj versions change.

### What is not realistically safe to guarantee

- A global npm install cannot reliably install system-level tools on every machine without user
  approval and OS-specific package manager support.
- Even if scripted, install hooks are frequently disabled (`--ignore-scripts`) in secure
  environments.

### Recommended install model

- Keep `@cellajs/cli` globally executable.
- Implement `cella doctor` and `cella setup jj`:
   - `doctor`: checks availability and versions of `jj`, `gh`, `pnpm`
   - `setup jj`: prints (or executes with `--yes`) OS-specific install commands
- Runtime behavior: if jj is missing, fail with actionable instructions. No fallback path.

This preserves architectural simplicity while keeping onboarding actionable.

---

## 6.2 jj-only Cella CLI (no git alternative)

If the primary objective is reducing internal complexity, a jj-only architecture is valid and
arguably cleaner than dual-mode support.

### Why jj-only is simpler in code

- Single VCS abstraction: no branching logic for `git` vs `jj`
- Single conflict model: first-class conflicts only, no `MERGE_HEAD` handling
- Single sync strategy: rebase-based sync only, no merge-vs-rebase conditionals
- Single diagnostics path: one set of errors, one recovery flow (`jj op undo`)
- Fewer edge-case tests: no matrix across VCS backends

In practice this removes an entire class of adapter complexity and keeps `merge-engine.ts` much
smaller over time.

### Product and adoption implications

- Hard requirement: every user must install jj before using the CLI
- CI and contributor docs must standardize on jj commands
- Team onboarding shifts from "Git-only" to "jj + GitHub" workflow

This is a strategic decision: less code complexity for maintainers, higher adoption friction for
new users.

### Recommended jj-only operating model

1. Keep Cella CLI globally executable.
2. On startup, fail fast if jj is missing with OS-specific install commands.
3. Remove `vcs` config entirely; jj is always the engine.
4. Implement only jj utilities (`src/utils/jj.ts`), delete git engine branching.
5. Keep Git interoperability only at remote boundary (push/pull with GitHub), not as an
   internal execution backend.

### Suggested policy statement for the project

"Cella CLI uses jj as its only local VCS engine. Git remains the remote interoperability layer
for GitHub, but local sync, conflict management, and history rewriting are jj-native."

### Minimum migration plan for existing users

- Release `@cellajs/cli` major version with jj-only requirement.
- Provide `cella setup jj` and `cella doctor` as mandatory preflight commands.
- Publish a one-time migration guide: Git repo to colocated jj+git repo.
- Keep one maintenance branch for old Git-based CLI for a short deprecation window.

If Cella is comfortable enforcing jj as a platform prerequisite, this route gives the cleanest
architecture and lowest long-term maintenance burden.

---

## 7. Concrete next steps

- [ ] Add jj detection utility (e.g. `detectJj`) and fail-fast startup preflight
- [ ] Implement `src/utils/jj.ts` as the single VCS command layer
- [ ] Migrate `merge-engine.ts` and related services to jj-only operations
- [ ] Remove git backend branches and related config toggles (`vcs` switch not needed)
- [ ] Add `cella doctor` and `cella setup jj` onboarding commands
- [ ] Add colocated repo migration docs and release as a major-version transition

---

*Assessment date: April 2026. jj version at time of writing: v0.40.0*
