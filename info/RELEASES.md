## Releases

Releases are automated with [release-please](https://github.com/googleapis/release-please). You never bump versions or push tags by hand — versions and changelogs are derived from [Conventional Commits](https://www.conventionalcommits.org).

### How it works

1. Land your work on `main` using Conventional Commit messages (enforced locally by a lefthook `commit-msg` hook running commitlint).
2. release-please opens and continuously updates a **release PR** per package, with the proposed version bump and a generated `CHANGELOG.md`.
3. Review the release PR. When you're happy, **merge it**. That bumps the version, updates the changelog, creates the git tag and publishes the GitHub Release.
4. For `@cellajs/create-cella`, merging its release PR runs the release gate and, on success, publishes the package to npm (with provenance).

There is no manual `pnpm version` / `git push --tags` step anymore.

### Deploys happen on release, not per merge

Production deploys are triggered only when the `cella` template GitHub Release is published — not on every merge to `main`. The deploy workflow ([.github/workflows/deploy.yml](../.github/workflows/deploy.yml)) listens for `release: published`, so a deploy is tied to release-please cutting a release. `@cellajs/create-cella` ships as a draft release and does not trigger a deploy. Manual deploys to staging/production are still available via `workflow_dispatch`.

### Release gate (security + e2e)

Heavy checks we don't want on every feature PR run **only at release time**, inside [.github/workflows/release.yml](../.github/workflows/release.yml), not as branch-protection required checks:

- When a release PR is merged, the `release-gate` job runs the security audit (`pnpm audit`) and the full test/e2e suite.
- Publishing `needs` that gate, so a failed gate ships nothing.
- The `@cellajs/create-cella` GitHub Release is created as a **draft** and only made public after npm publish succeeds (`--draft=false`). A failed gate leaves no public release and no npm version.

This keeps day-to-day PRs fast while making the irreversible publish step the thing that's actually gated. To add a release-only check, add a step to the `release-gate` job — no ruleset changes needed.

### Packages

Versioning is per package via [.github/release-please-config.json](../.github/release-please-config.json) and [.github/release-please-manifest.json](../.github/release-please-manifest.json):

| Package | Path | Tag prefix | Published |
| --- | --- | --- | --- |
| `cella` (the template) | `.` | `v*` | GitHub Release only |
| `@cellajs/create-cella` | `cli/create-cella` | `create-cella-v*` | npm + GitHub Release |

Commits are routed to a package by path: a commit touching `cli/create-cella/**` updates the scaffolder, everything else updates the template. **To add another releasable package later, add one entry to both files — no workflow changes are needed.**

### Commit types → changelog sections

Commit messages must use a Conventional Commit type. Types map to changelog sections (see `changelog-sections` in [.github/release-please-config.json](../.github/release-please-config.json)):

- `feat:` → 🎉 New features (minor bump)
- `fix:` → 🐞 Bug fixes (patch bump)
- `perf:` / `refactor:` → 🔧 Small improvements
- `revert:` → ⏪ Reverts
- `docs:` → 📖 Documentation
- `chore:`, `build:`, `ci:`, `style:`, `test:` → hidden from notes

Add `!` after the type (e.g. `feat!:`) or a `BREAKING CHANGE:` footer to trigger a breaking-change section and a larger version bump. For fork-facing breaking changes, link a short migration note in `info/` from the commit body.

### Pre-1.0 versioning

While the template is on `0.x`, breaking changes bump the minor and features bump the patch (`bump-minor-pre-major`), so the version stays meaningful for forks consuming upstream via `pnpm cella`.

### Release automation setup (one-time)

The release workflow ([.github/workflows/release.yml](../.github/workflows/release.yml)) needs a few repo-side secrets and settings. This is required once per repo (and per fork that wants its own releases).

**GitHub App token** — release-please opens the release PR with a token from a dedicated GitHub App. An App token (not the default `GITHUB_TOKEN`) is used so the release PR also *triggers* the CI/`pr-title` checks that are required to merge it.

1. Create a GitHub App (org or account settings → Developer settings → GitHub Apps → New). Disable the webhook. Grant **repository permissions**: `Contents: Read and write` and `Pull requests: Read and write`.
2. Generate a private key (downloads a `.pem`) and note the numeric **App ID**.
3. Install the App on this repository only.
4. Add repo secrets:
   - `RELEASE_APP_ID` — the App ID.
   - `RELEASE_APP_PRIVATE_KEY` — the full contents of the `.pem`.

**npm publishing** (`@cellajs/create-cella`):
- `NPM_TOKEN` — an npm **automation** token (does not prompt for OTP).

**Repo settings:**
- `main` ruleset: squash-merge only, require linear history, and require the `pr-title`, `lint`, `test` and `test-cella-cli` checks. Do **not** require `release-gate` (it runs at release time, not on PRs).
- "Allow GitHub Actions to create and approve pull requests" can stay **disabled** — the GitHub App creates the release PR, not Actions.


