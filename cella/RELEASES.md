# Releases

This document explains how versions, changelogs, releases, and production deploys are produced from merged work.

### TL;DR

Release automation reads commit messages to choose versions and write changelogs, then opens a pull
request containing those changes. Do not change versions or create tags by hand. Slower test suites
run on that release pull request. Production deploys only after it is merged and the GitHub Release
is published.

## How it works

1. Land work on `main` with Conventional Commit messages (a lefthook `commit-msg` hook runs commitlint locally).
2. release-please keeps an open **release PR per package**, continuously updating the proposed version bump and generated [Changelog](./CHANGELOG.md).
3. The release PR runs the full CI, including the heavy suites (see [Gating](#gating)). Merge it when green: it bumps the version, updates the changelog, tags, and publishes the GitHub Release.

## Deploy timing

Production deploys fire only when the `cella` template GitHub Release is published, not on every merge: [deploy.yml](../.github/workflows/deploy.yml) listens for `release: published`. Manual staging/production deploys remain available via `workflow_dispatch`.

## Gating

The heavy suites (full test suite + Storybook component tests) are too slow to run on every feature PR, so they run **only on the release-please PR**, as required status checks in [ci.yml](../.github/workflows/ci.yml):

- Feature PRs run cheap checks only (`lint`, `pr-title`, `schema-bust-gate`). The heavy jobs report `skipped`, which a required check treats as a pass, so they don't block day-to-day PRs.
- When release-please refreshes its PR (on each merge to `main`), the heavy jobs run for real against the current `main`.
- The release PR can't be merged until they pass, so a broken `main` blocks the release before any tag or deploy.

There is no separate release-time gate: [deploy.yml](../.github/workflows/deploy.yml) does build + rollout only and assumes validated code. A manual `workflow_dispatch` deploy bypasses CI by design.

## Packages

Versioning is per package via [release-please-config.json](../.github/release-please-config.json) and [release-please-manifest.json](../.github/release-please-manifest.json):

| Package                | Path | Tag prefix | Published           |
| ---------------------- | ---- | ---------- | ------------------- |
| `cella` (the template) | `.`  | `v*`       | GitHub Release only |

The scaffolder (`@cellajs/create-cella`) lives in its own repo, [cellajs/create-cella](https://github.com/cellajs/create-cella), with its own release automation. **Add another releasable package by adding one entry to both files; no workflow changes.**

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

A `!` (e.g. `feat!:`) or a `BREAKING CHANGE:` footer forces a breaking-change section and larger bump; link a fork-facing migration note in `cella/` from the commit body.

## Pre-1.0 versioning

While on `0.x` (`bump-minor-pre-major`), breaking changes bump the minor and features bump the patch, keeping versions meaningful for forks consuming upstream via `pnpm cella`.

## Automation setup

[release.yml](../.github/workflows/release.yml) needs a few secrets/settings. An org-wide Github App is ideal because it can be set up once and cover all repos.

**GitHub App token**: release-please opens the release PR with a dedicated GitHub App token so the PR _triggers_ the required CI/`pr-title` checks.

1. Create a GitHub App (org/account → Developer settings → GitHub Apps → New), disable the webhook, grant repo permissions `Contents: Read and write` and `Pull requests: Read and write`.
2. Generate a private key (`.pem`) and note the numeric **Client ID**.
3. Install the App on each repo that releases.
4. Add `RELEASE_APP_ID` (Client ID) and `RELEASE_APP_PRIVATE_KEY` (full `.pem`) as **repo** or **org** secrets; org secrets let every repo reuse one App.

**npm publishing**: the `cella` template is GitHub-Release-only and needs no npm auth. The scaffolder `@cellajs/create-cella` is published from its own repo ([cellajs/create-cella](https://github.com/cellajs/create-cella)); its npm Trusted Publisher / `NPM_TOKEN` setup lives there.

**Repo settings:**

- `main` ruleset: squash-merge only, linear history, require `lint`, `test`, `storybook-test`, `schema-bust-gate`. `test` and `storybook-test` run for real only on the release PR and `skip` (pass) on feature PRs, so keeping them required is what blocks merging a release PR whose heavy suites fail.
- "Allow GitHub Actions to create and approve pull requests" can stay **disabled**: the App, not Actions, creates the release PR.
