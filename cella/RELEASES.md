# Releases

How versions, changelogs, releases, and production deploys are produced from merged work.

### TL;DR

Release automation reads commit messages to choose versions and write changelogs, then opens a pull
request with those changes. Never change versions or create tags by hand. The slow test suites run
on that release pull request. Production deploys only after it is merged and the GitHub Release is
published.

## How it works

1. Merge work into `main` with Conventional Commit messages (a local `commit-msg` hook checks the header). `fix:` bumps the patch. From `1.0` on, `feat:` bumps the minor and a breaking change (`feat!:` or a `BREAKING CHANGE:` footer) the major. On `0.x`, the template's current state, a feature bumps the patch and a breaking change the minor, so versions stay meaningful for apps syncing upstream via `pnpm cella`. Types and their changelog sections: [release-please-config.json](../.github/release-please-config.json).
2. release-please keeps an open **release PR**, updating the proposed version bump and generated [Changelog](./CHANGELOG.md) on every merge.
3. Merging the release PR bumps the version, updates the changelog, tags, and publishes the GitHub Release. Production follows the releases: the runner deploys the new tag about a minute later ([Deploys](./DEPLOYMENT.md#deploys)).

## Gating

Feature PRs run the cheap checks; the heavy suites (full tests, the runtime-role and app-shaped reruns, Storybook component tests, the service images) run **only on the release PR**, in [ci.yml](../.github/workflows/ci.yml), and report `skipped` elsewhere. The one required check, `ci-passed`, fails when a job failed or was cancelled; a skipped job counts as passed.

Each merge to `main` refreshes the release PR and the heavy jobs run for real, so a broken `main` blocks the release before any tag or deploy.

None of this runs the scaffolder's output: the config files `@cellajs/create-cella` generates replace cella's, so a change to their shape breaks a new app while cella stays green. The scaffolder's own repo checks that every night ([create-flow.yml](https://github.com/cellajs/create-cella/blob/main/.github/workflows/create-flow.yml)): it creates an app and follows its README up to a signed-in page with seeded data. A red run names the README step that broke; to try a cella branch, dispatch that workflow with the branch as its `cella-ref`.

pnpm serves a new package version only a day after its publish, so a release here that needs a newer scaffolder ships at least a day after that scaffolder is on npm.

## Setup

Versioning is per package via [release-please-config.json](../.github/release-please-config.json) and [release-please-manifest.json](../.github/release-please-manifest.json). The template is the only entry (a bare version tag such as `0.16.0`, GitHub Release only). Add a releasable package by adding one entry to both files. The scaffolder `@cellajs/create-cella` releases from [its own repo](https://github.com/cellajs/create-cella).

[release.yml](../.github/workflows/release.yml) opens the release PR with a GitHub App token, so the PR triggers the required checks. To set it up:

1. Create a GitHub App with `Contents` and `Pull requests` read and write.
2. Install it on the repo.
3. Store its Client ID and private key as the `RELEASE_APP_ID` and `RELEASE_APP_PRIVATE_KEY` secrets.

The `main` ruleset requires squash merges, linear history, and the `ci-passed` check. "Allow GitHub Actions to create and approve pull requests" can stay disabled.
