# Releases

How versions, changelogs, releases, and production deploys are produced from merged work.

### TL;DR

Release automation reads commit messages to choose versions and write changelogs, then opens a pull
request with those changes. Never change versions or create tags by hand. The slow test suites run
on that release pull request. Production deploys only after it is merged and the GitHub Release is
published.

## How it works

1. Merge work into `main` with Conventional Commit messages (a lefthook `commit-msg` hook runs commitlint locally).
2. release-please keeps an open **release PR per package**, updating the proposed version bump and generated [Changelog](./CHANGELOG.md) on every merge.
3. The release PR runs full CI including the heavy suites (see [Gating](#gating)). Merging it bumps the version, updates the changelog, tags, and publishes the GitHub Release.

## Deploy timing

Production deploys fire only when the `cella` GitHub Release is published: [deploy.yml](../.github/workflows/deploy.yml) listens for `release: published`. Manual staging/production deploys remain available via `workflow_dispatch`.

## Gating

The heavy suites (full tests + Storybook component tests) run **only on the release-please PR**, as required status checks in [ci.yml](../.github/workflows/ci.yml):

- Feature PRs run cheap checks only (`lint`, `pr-title`, `schema-bust-gate`). The heavy jobs report `skipped`, which a required check treats as a pass.
- Each merge to `main` refreshes the release PR, and the heavy jobs run for real against current `main`.
- The release PR cannot merge until they pass, so a broken `main` blocks the release before any tag or deploy.

There is no separate release-time gate: [deploy.yml](../.github/workflows/deploy.yml) does build + rollout only. A manual `workflow_dispatch` deploy bypasses CI by design.

## Packages

Versioning is per package via [release-please-config.json](../.github/release-please-config.json) and [release-please-manifest.json](../.github/release-please-manifest.json):

| Package                | Path | Tag prefix | Published           |
| ---------------------- | ---- | ---------- | ------------------- |
| `cella` (the template) | `.`  | `v*`       | GitHub Release only |

The scaffolder `@cellajs/create-cella` lives in [cellajs/create-cella](https://github.com/cellajs/create-cella) with its own release automation. **Add a releasable package by adding one entry to both files; no workflow changes.**

## Commit types

Types map to changelog sections (`changelog-sections` in [release-please-config.json](../.github/release-please-config.json)):

- `feat:` → 🎉 New features (minor bump)
- `fix:` → 🐞 Bug fixes (patch bump)
- `perf:` / `refactor:` → 🔧 Small improvements
- `revert:` → ⏪ Reverts
- `docs:` → 📖 Documentation
- `build:` / `ci:` → 🏗️ Build & deps
- `chore:` → 🧹 Chores
- `style:` → 🎨 Styles
- `test:` → 🧪 Tests

A `!` (e.g. `feat!:`) or a `BREAKING CHANGE:` footer forces a breaking-change section and a larger bump; link the app-facing migration note in `cella/` from the commit body.

## Pre-1.0 versioning

On `0.x` (`bump-minor-pre-major`), breaking changes bump the minor and features bump the patch, so versions stay meaningful for apps syncing upstream via `pnpm cella`.

## Automation setup

[release.yml](../.github/workflows/release.yml) needs a few secrets and settings. An org-wide GitHub App covers all repos with one setup.

**GitHub App token**: release-please opens the release PR with a GitHub App token so the PR _triggers_ the required CI/`pr-title` checks.

1. Create a GitHub App (org/account → Developer settings → GitHub Apps → New), disable the webhook, grant `Contents: Read and write` and `Pull requests: Read and write`.
2. Generate a private key (`.pem`) and note the numeric **Client ID**.
3. Install the App on each releasing repo.
4. Add `RELEASE_APP_ID` (Client ID) and `RELEASE_APP_PRIVATE_KEY` (full `.pem`) as **repo** or **org** secrets.

**npm publishing**: the `cella` template is GitHub-Release-only and needs no npm auth. `@cellajs/create-cella` publishes from its own repo; its npm Trusted Publisher / `NPM_TOKEN` setup lives there.

**Repo settings:**

- `main` ruleset: squash-merge only, linear history, require `lint`, `test`, `storybook-test`, `schema-bust-gate`. `test` and `storybook-test` skip (pass) on feature PRs and run for real on the release PR, so keeping them required blocks a release PR whose heavy suites fail.
- "Allow GitHub Actions to create and approve pull requests" can stay **disabled**: the App creates the release PR, not Actions.
