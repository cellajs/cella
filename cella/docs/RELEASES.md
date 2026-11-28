# Releases

This document explains how merged work becomes a version, a changelog and a production deploy, through [Conventional Commits](https://www.conventionalcommits.org) and [release-please](https://github.com/googleapis/release-please).

### TL;DR

Commit messages decide the next version and fill the changelog. release-please keeps a release pull request open with
both. Merging it tags the release for production to deploy. Never set versions or tags by hand.

## How it works

1. Merge into `main` with Conventional Commit messages. While the version is `0.x`, `fix:` and `feat:` bump the patch. A breaking change such as `feat!:` bumps the minor: an upgrading app can tell a breaking release apart.
2. release-please keeps a draft **release PR** open and updates it on every merge with the next version and the [Changelog](../CHANGELOG.md).
3. Mark the release PR ready for review, which runs the release checks. After its merge, the next scheduled run of the main job deploys the release ([Deploys](./DEPLOYMENT.md#deploys)).

## Gating

A broken `main` blocks the release before anything is tagged or deployed. Checks run at three moments, never on a draft release PR:

- **Feature PR:** the quick checks.
- **Release PR, ready for review:** the quick checks and the slow suites in [ci.yml](../../.github/workflows/ci.yml), again on every merge while it is ready.
- **Nightly on `main`:** the test suites.

The release PR also fails while its description of the app differs from the last apply ([Pull request check](./deployment/CHANGING_INFRASTRUCTURE.md#pull-request-check)).

## Setup

Releases act as a GitHub App that alone may tag.

1. Create a GitHub App with `Contents` and `Pull requests` read and write, and install it on the repo.
2. Store its Client ID and private key as the `RELEASE_APP_ID` and `RELEASE_APP_PRIVATE_KEY` secrets. A PR the App opens runs the required checks.
3. In the `main` ruleset, require squash merges, linear history and the `ci-passed` and `pr-title` checks.
4. Add a tag ruleset on every tag that restricts creations, updates and deletions. Its only bypass is the release App. Production deploys the newest tag whose commit `main` contains: whoever may push a tag chooses among the commits that passed the `main` ruleset.
5. Set the repository variable `PRODUCTION_URL` to the app's address, without a trailing slash. [deploy-status.yml](../../.github/workflows/deploy-status.yml) then shows each release in the repository's Deployments panel. It reports a success once production answers with the release's commit, and a failure when that takes too long. Run `pnpm cella infra logs` for the cause.
