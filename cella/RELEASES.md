# Releases

How merged work becomes a version, a changelog and a production deploy.

### TL;DR

Commit messages decide the next version and fill the changelog. release-please keeps a release pull request open with
both. Merging it tags the release for production to deploy. Never set versions or tags by hand.

## How it works

1. Merge into `main` with Conventional Commit messages. While cella is on `0.x`, `fix:` and `feat:` bump the patch. A breaking change such as `feat!:` bumps the minor, so an upgrading app can tell a breaking release apart.
2. On every merge, release-please updates the open **release PR** with the next version and the [Changelog](./CHANGELOG.md).
3. Merging the release PR tags the version and publishes the GitHub Release. The next scheduled run of the main job deploys it ([Deploys](./DEPLOYMENT.md#deploys)).

## Gating

Feature PRs run the quick checks. The slow suites in [ci.yml](../.github/workflows/ci.yml) run on the release PR, which every merge refreshes. So a broken `main` blocks the release before anything is tagged or deployed. The release PR also fails while its description of the app differs from the last apply ([Pull request check](./deployment/CHANGING_INFRASTRUCTURE.md#pull-request-check)).

## Setup

1. Create a GitHub App with `Contents` and `Pull requests` read and write, and install it on the repo.
2. Store its Client ID and private key as the `RELEASE_APP_ID` and `RELEASE_APP_PRIVATE_KEY` secrets. [release.yml](../.github/workflows/release.yml) opens the release PR and tags each release with it, so the PR runs the required checks.
3. In the `main` ruleset, require squash merges, linear history and the `ci-passed` and `pr-title` checks.
4. Add a tag ruleset on every tag that restricts creations, updates and deletions. Its only bypass is the release App. Production deploys the newest tag, so whoever may push one chooses what runs.
5. Set the repository variable `PRODUCTION_URL` to the app's address, without a trailing slash. [deploy-status.yml](../.github/workflows/deploy-status.yml) then shows each release in the repository's Deployments panel. It reports a success once production answers with the release's commit, and a failure when that takes too long. It reads only the public health endpoint, so a failure does not say why. `pnpm infra runs` does.
