# @cellajs/cli

Keep your Cella-based app in sync with upstream template updates while preserving your
customizations.

## Usage

From your monorepo root, run `pnpm cella` for the interactive menu, or call a service directly:

```bash
pnpm cella analyze
pnpm cella sync --hard
pnpm cella audit --check-overrides
pnpm cella contributions --fork raak --json
```

## Services

| Service | Description |
|---------|-------------|
| `analyze` | Dry run to see what would change on sync |
| `sync` | Merge upstream changes onto a fresh branch and open a squash-merge PR into `main` |
| `audit` | Check for outdated packages & vulnerabilities |
| `stats` | Count files by category and workspace package |
| `forks` * | Sync downstream to local fork repositories |
| `contributions` * | Pull and adopt changes from local forks |

\* `forks` and `contributions` only appear in the menu when you have `forks` configured in `cella.config.ts`. These are for upstream template developers who maintain multiple downstream forks.

## CLI options

```bash
pnpm cella [service] [options]
```

Per-service help: `pnpm cella <service> --help`.

| Service | Useful options |
|---------|----------------|
| analyze | `--log`, `--list`, `--json`, `--scope <all\|risk\|protected>`, `--diff <path>`, `--open-diff <path>` |
| sync | `--log`, `--hard`, `--unpinned`, `--track <release\|branch>` |
| audit | `--list`, `--force`, `--check-overrides` |
| forks | `--fork <name>`, `--log`, `--hard`, `-V, --verbose` |
| contributions | `--fork <name>`, `--list`, `--json`, `--diff <path>` |
| stats | `--coverage`, `-V, --verbose` |

| Global flag | Description |
|-------------|-------------|
| `-v, --version` | Output the current version |
| `-h, --help` | Display help message |

## Configuration

Sync behavior lives in `cella.config.ts` at your monorepo root (a sensible default ships with new
apps). To deviate files or folders from the template:

- **`ignored`** — files completely excluded from sync (existing and new)
- **`pinned`** — full fork control: existing, modified, or deleted files are preserved

## Upstream tracking

The sync CLI tracks upstream cella one of two ways, set via `settings.upstreamTrack`:

| Mode | Behavior | For |
|------|----------|-----|
| `release` (default) | Sync to a last cella release tag. Stable and reviewable — each bump maps to a changelog. | Most forks |
| `branch` | Follow the bleeding-edge tip of `settings.upstreamBranch`. | cella maintainers, active development |

For a one-off run that ignores the configured mode, pass `--track`:

```bash
pnpm cella sync --track branch   # follow the tip once, without editing config
```

## Sync workflow

`pnpm cella sync` never commits to `main` directly. Under release-please, `main` is
squash-merge-only with linear history, so each run cuts a **fresh temporary branch** from the
trunk (`settings.releaseBase`, default `main`), named with `settings.syncBranchPrefix` (default
`cella/sync`):

```
main ──▶ cella/sync/<stamp> ──(3-way merge)──▶ PR ──(squash)──▶ main
```

It runs a real git 3-way merge and leaves the result **staged** — it never auto-commits on the
first pass. `sync` is **idempotent and two-phase**:

1. **First run** cuts the branch and stages the merge, then stops so you can review (and resolve
   any conflicts in your IDE — `git add` the resolved files).
2. **Re-run `pnpm cella sync`** on the same branch to finish: it reconciles dependencies
   (`pnpm install` + `pnpm check`), stages everything, commits the delta, pushes to `origin`,
   opens a PR into `main` (via `gh`), and switches you back to `main`.

When you commit, the in-progress merge state (`MERGE_HEAD`) is discarded, so the staged delta
collapses into a **single-parent commit** (`chore: sync upstream cella <sha>`). This keeps the PR
to one clean commit with the incremental diff — a two-parent merge commit would instead list the
upstream branch's entire history, because the fork doesn't share pushed ancestry with upstream
and the local `git replace` graft that makes merges incremental is never pushed. Ancestry lives
in `refs/cella/last-sync` (and the committed `cella.manifest.json` for fresh clones), so
`git merge-base` keeps working across throwaway branches — each is safe to delete once its PR
lands. The three-segment name can't collide with git's ref namespacing, so there's no long-lived
`cella-sync` branch to conflict with.

If conflicts remain when you re-run, `sync` lists them and stops (never starting a second cycle
mid-merge). If `pnpm check`, the push, or `gh` fails, it degrades gracefully — reporting the
issue and printing the remaining manual steps:

```bash
git push -u origin cella/sync/<stamp>
gh pr create --base main --head cella/sync/<stamp> --fill
```

## Sync rules

For each file, `sync` compares fork and upstream **content** (blob comparison) and resolves it
per the table below. Unconfigured files converge on upstream; `ignored` and `pinned` let you opt
out:

| Scenario | `ignored` | `pinned` | Default |
|----------|:---------:|:--------:|:-------:|
| Content identical | ✅ Keep | ✅ Keep | ✅ Keep |
| Content differs | ⏭️ Skip | ✅ Keep yours | ⬇️ Take upstream |
| New upstream file | ⏭️ Skip | ✅ Keep (respect deletion) | ➕ Add file |
| Deleted in upstream | ✅ Keep | ✅ Keep | 🗑️ Delete |
| Only in your app | ✅ Keep | ✅ Keep | ✅ Keep |

**Choosing an override:** `ignored` = file never syncs and is fully hidden (app-specific docs,
assets, config you own). `pinned` = your version always wins but stays visible (files you
customize). Unconfigured = syncs automatically. Run `pnpm cella analyze` first to preview.

### Aggressive sync flags

Two opt-in flags make `sync` more aggressive. Both resurface full upstream history (natural merge-base, not the last-sync point), so expect a larger diff and a post-run warning — cherry-pick deliberately. They compose (`--hard --unpinned`).

| Flag | Effect |
|------|--------|
| `--hard` | Overwrites `drifted` files with upstream (local-only changes are replaced) |
| `--unpinned` | Ignores `pinned` files so upstream surfaces as `behind`/`diverged`; `package.json` stays pinned |

## Status indicators

During analysis and sync, files are displayed with status indicators:

| Symbol | Label | Meaning | Action |
|:------:|-------|---------|--------|
| ✓ | `identical` | Fork matches upstream | No action needed |
| ↑ | `ahead` | Fork changed (pinned/ignored) | Protected, keeping fork |
| ! | `drifted` | Fork changed, not protected | At risk, consider pinning |
| ↓ | `behind` | Upstream has changes | Will sync from upstream |
| ⇅ | `diverged` | Both sides changed | Will merge from upstream |
| ⨀ | `pinned` | Both changed, fork wins | Protected, keeping fork |
| ◌ | `local` | Only in fork, never in upstream | No action needed |

## Package.json sync

`packageJsonSync` controls which package.json sections sync from upstream:

```typescript
packageJsonSync: ['dependencies', 'devDependencies', 'scripts']
```

**Supported keys:** `dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`, `scripts`, `engines`, `packageManager`, `overrides`

It **adds** new keys and **updates** existing ones to match upstream, but never **removes** keys
that only exist in your fork — so extra dependencies and scripts survive each sync.

## Contributions (pull from forks)

Upstream can pull modifications from local forks and selectively adopt them.

### Configuration

List your local forks in `cella.config.ts`:

```typescript
forks: [
  { name: 'raak', localPath: '../raak', pullBranch: 'main' },
],
```

### Pulling contributions

Run `pnpm cella contributions` (or pick **contributions** from the menu). Select one or more
forks; cella fetches each fork's `pullBranch`, builds a clean local `contrib/<fork>` branch with
only that fork's contributed files. Accepted files are checked out from the contrib branch and staged for review.
