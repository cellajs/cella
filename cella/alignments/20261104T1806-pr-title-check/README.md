---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: pr-title, ci-passed
---

# The PR title check is its own required check

`pr-title` moved out of `ci.yml` into `.github/workflows/pr-title.yml` and left `ci-passed`, so an app's `main` ruleset requires `pr-title` next to `ci-passed`. Until it does, a PR with a failing title can still merge.

## What & why

The squash title of a PR becomes the commit on main that release-please reads. `ci.yml` never ran on `edited`, so a retitled PR kept its old result. The new workflow runs on `edited` too and re-lints a retitled PR without rerunning CI. `ci-passed` no longer covers the title.

## Blast radius

Every app whose ruleset requires only `ci-passed`. No code, schema or cache change. An app that changed its own `pr-title` job in `ci.yml` moves that change into `pr-title.yml`.

## Run

No script: manual.

## Manual steps

1. In the repository settings, add the `pr-title` check (GitHub Actions) to the `main` ruleset's required status checks.

## Verify

Retitle an open PR to a title without a type: `pr-title` turns red and the PR cannot merge.
