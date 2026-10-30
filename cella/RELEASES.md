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
2. Store its Client ID and private key as the `RELEASE_APP_ID` and `RELEASE_APP_PRIVATE_KEY` secrets. [release.yml](../.github/workflows/release.yml) opens the release PR and tags each release with it, so the PR runs the required checks.
3. In the `main` ruleset, require squash merges, linear history and the `ci-passed` check.
4. Add a tag ruleset on every tag that restricts creations, updates and deletions, with the release App as its only bypass: production deploys the newest tag, so whoever may push one chooses what runs.
5. Set the repository variable `PRODUCTION_URL` to the app's address, without a trailing slash. [deploy-status.yml](../.github/workflows/deploy-status.yml) then shows each release in the repository's Deployments panel: a success once production answers with the release's commit, a failure when it has not after 20 minutes. It reports what the public health endpoint says, so a failure does not say why: `pnpm infra runs` does.
