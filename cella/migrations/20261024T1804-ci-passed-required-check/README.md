---
syncBreaking: true
clientCacheBump: false
---

# One required check: ci-passed

Require the `ci-passed` check in the `main` ruleset (or branch protection) and remove the `lint`, `test`,
`storybook-test` and `schema-bust-gate` entries. On the sync PR the `test` job reports as `test (full)`,
`test (runtime)` and `test (app-shape)`, so a ruleset that still requires `test` waits for a check that never comes.

## What & why

`ci.yml` runs the test suites as one matrix job per suite, builds the base stage and the three service images in one
`docker-images` job, and runs the sign-in suites as a new app (`pnpm template:check --tests`) in `build-services` on
every PR. The last job, `ci-passed`, needs every other job and fails when one failed or was cancelled, so requiring it
alone also gates the image builds, the service boot and the infra preflight.

## Blast radius

Every app that requires status checks on `main`; an app without a ruleset or branch protection has nothing to do.
No code, database or cache change. The sign-in suites add a few seconds to `build-services` on every PR.

## Run

No script: manual.

## Manual steps

1. In the repository settings, open the ruleset (or branch protection rule) for `main`.
2. Under required status checks, add `ci-passed` (GitHub Actions) and remove every other job of `ci.yml`.
3. An open PR whose last CI run predates the sync has no `ci-passed`: push to it or merge `main` into it.

## Verify

```sh
gh api 'repos/{owner}/{repo}/rules/branches/main' --jq '.[] | select(.type == "required_status_checks") | .parameters.required_status_checks[].context'
pnpm check
```
