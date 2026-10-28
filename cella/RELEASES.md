# Releases

How merged work becomes a version, a changelog and a production deploy.

### TL;DR

Commit messages decide the next version and fill the changelog. release-please keeps a release pull request open with
both, and merging it tags the release, which production then deploys. Never set versions or tags by hand.

## How it works

1. Merge into `main` with Conventional Commit messages. While cella is on `0.x`, `fix:` and `feat:` bump the patch and a breaking change (`feat!:`) the minor, so an upgrading app can tell a breaking release apart.
2. On every merge, release-please updates the open **release PR** with the next version and the [Changelog](./CHANGELOG.md).
3. Merging the release PR tags the version and publishes the GitHub Release; the runner deploys it about a minute later ([Deploys](./DEPLOYMENT.md#deploys)).

## Gating

Feature PRs run the quick checks. The slow suites in [ci.yml](../.github/workflows/ci.yml) run on the release PR, which every merge refreshes, so a broken `main` blocks the release before anything is tagged or deployed.

## Setup

1. Create a GitHub App with `Contents` and `Pull requests` read and write, and install it on the repo.
2. Store its Client ID and private key as the `RELEASE_APP_ID` and `RELEASE_APP_PRIVATE_KEY` secrets. [release.yml](../.github/workflows/release.yml) opens the release PR with it, so the PR runs the required checks.
3. In the `main` ruleset, require squash merges, linear history and the `ci-passed` check.
