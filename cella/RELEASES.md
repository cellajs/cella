# Releases

How versions, changelogs, releases, and production deploys are produced from merged work.

### TL;DR

Release automation reads commit messages to choose versions and write changelogs, then opens a pull
request with those changes. Never change versions or create tags by hand. The slow test suites run
on that release pull request. Production deploys only after it is merged and the GitHub Release is
published.

## How it works

1. Merge work into `main` with Conventional Commit messages (a lefthook `commit-msg` hook runs commitlint locally). `feat:` bumps minor and `fix:` bumps patch. A `!` (`feat!:`) or a `BREAKING CHANGE:` footer forces a breaking-change section and a larger bump. Types and their changelog sections: [release-please-config.json](../.github/release-please-config.json).
2. release-please keeps an open **release PR**, updating the proposed version bump and generated [Changelog](./CHANGELOG.md) on every merge.
3. Merging the release PR bumps the version, updates the changelog, tags, and publishes the GitHub Release, which triggers the production deploy ([CI deploys](./DEPLOYMENT.md#ci-deploys)).

On `0.x` (`bump-minor-pre-major`), breaking changes bump the minor and features bump the patch, so versions stay meaningful for apps syncing upstream via `pnpm cella`.

## Gating

The heavy suites (full tests + Storybook component tests) run **only on the release PR**, as required status checks in [ci.yml](../.github/workflows/ci.yml). Feature PRs run cheap checks (`lint`, `pr-title`, `schema-bust-gate`, `frontend-build`). The heavy jobs report `skipped`, which a required check treats as a pass. Each merge to `main` refreshes the release PR and the heavy jobs run for real, so a broken `main` blocks the release before any tag or deploy. [deploy.yml](../.github/workflows/deploy.yml) does build and rollout only. A manual `workflow_dispatch` deploy bypasses CI by design.

## Setup

Versioning is per package via [release-please-config.json](../.github/release-please-config.json) and [release-please-manifest.json](../.github/release-please-manifest.json). The template is the only entry (tag `v*`, GitHub Release only). Add a releasable package by adding one entry to both files. The scaffolder `@cellajs/create-cella` releases from [its own repo](https://github.com/cellajs/create-cella).

[release.yml](../.github/workflows/release.yml) opens the release PR with a GitHub App token, so the PR triggers the required checks: create a GitHub App with `Contents` and `Pull requests` read and write, install it on the repo, and store its Client ID and private key as the `RELEASE_APP_ID` and `RELEASE_APP_PRIVATE_KEY` secrets. The `main` ruleset requires squash merges, linear history, and the `lint`, `test`, `storybook-test`, and `schema-bust-gate` checks. "Allow GitHub Actions to create and approve pull requests" can stay disabled.
