## Releases

Releases are automated with [release-please](https://github.com/googleapis/release-please); versions and changelogs derive from [Conventional Commits](https://www.conventionalcommits.org). Never bump versions or push tags by hand.

### How it works

1. Land work on `main` with Conventional Commit messages (a lefthook `commit-msg` hook runs commitlint locally).
2. release-please keeps an open **release PR per package**, continuously updating the proposed version bump and generated [`cella/CHANGELOG.md`](./CHANGELOG.md).
3. Merge the release PR when ready — it bumps the version, updates the changelog, tags, and publishes the GitHub Release.
4. On merge, the `release-gate` job (security audit + full e2e) runs before the GitHub Release is finalized — see below.

### Deploys happen on release, not per merge

Production deploys fire only when the `cella` template GitHub Release is published, not on every merge: [deploy.yml](../.github/workflows/deploy.yml) listens for `release: published`. Manual staging/production deploys remain available via `workflow_dispatch`.

### Release gate (security + e2e)

Heavy checks run **only at release time** in [release.yml](../.github/workflows/release.yml), not as branch-protection required checks:

- On release-PR merge, the `release-gate` job runs the security audit (`pnpm audit --audit-level=high`) and the full test/e2e suite.
- The GitHub Release is finalized only if the gate passes, so a failed gate ships nothing.

This keeps day-to-day PRs fast and gates only the irreversible publish. Add release-only checks as steps in `release-gate` — no ruleset changes needed.

### Packages

Versioning is per package via [release-please-config.json](../.github/release-please-config.json) and [release-please-manifest.json](../.github/release-please-manifest.json):

| Package | Path | Tag prefix | Published |
| --- | --- | --- | --- |
| `cella` (the template) | `.` | `v*` | GitHub Release only |

The scaffolder (`@cellajs/create-cella`) lives in its own repo, [cellajs/create-cella](https://github.com/cellajs/create-cella), with its own release automation. **Add another releasable package by adding one entry to both files — no workflow changes.**

### Commit types → changelog sections

Types map to changelog sections (`changelog-sections` in [release-please-config.json](../.github/release-please-config.json)):

- `feat:` → 🎉 New features (minor bump)
- `fix:` → 🐞 Bug fixes (patch bump)
- `perf:` / `refactor:` → 🔧 Small improvements
- `revert:` → ⏪ Reverts
- `docs:` → 📖 Documentation
- `chore:`, `build:`, `ci:`, `style:`, `test:` → hidden from notes

A `!` (e.g. `feat!:`) or a `BREAKING CHANGE:` footer forces a breaking-change section and larger bump; link a fork-facing migration note in `cella/` from the commit body.

### Pre-1.0 versioning

While on `0.x` (`bump-minor-pre-major`), breaking changes bump the minor and features bump the patch — keeping versions meaningful for forks consuming upstream via `pnpm cella`.

### Release automation setup (one-time)

[release.yml](../.github/workflows/release.yml) needs a few secrets/settings. A per-repo GitHub App is set up once per repo; an org-wide App (recommended when one org owns multiple repos/forks) is mostly set up once for the org.

**GitHub App token** — release-please opens the release PR with a dedicated GitHub App token (not `GITHUB_TOKEN`) so the PR *triggers* the required CI/`pr-title` checks.

1. Create a GitHub App (org/account → Developer settings → GitHub Apps → New), disable the webhook, grant repo permissions `Contents: Read and write` and `Pull requests: Read and write`.
2. Generate a private key (`.pem`) and note the numeric **Client ID**.
3. Install the App on each repo that releases.
4. Add `RELEASE_APP_ID` (Client ID) and `RELEASE_APP_PRIVATE_KEY` (full `.pem`) as **repo** or **org** secrets — org secrets let every repo reuse one App.

*One App, many repos:* one org-owned App serves cella plus every fork **you own** — install per repo, credentials as org secrets (only the install is per-repo). Forks owned by **others** can't read your org secrets, so each independent fork needs its own App.

**npm publishing** — the `cella` template is GitHub-Release-only and needs no npm auth. The scaffolder `@cellajs/create-cella` is published from its own repo ([cellajs/create-cella](https://github.com/cellajs/create-cella)); its npm Trusted Publisher / `NPM_TOKEN` setup lives there.

**Repo settings:**
- `main` ruleset: squash-merge only, linear history, require `pr-title`, `lint`, `test`, `test-cella-cli`. Do **not** require `release-gate` (it runs at release time, not on PRs).
- "Allow GitHub Actions to create and approve pull requests" can stay **disabled** — the App, not Actions, creates the release PR.


