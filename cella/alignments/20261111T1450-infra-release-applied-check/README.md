---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: RELEASE_FLAG, privileged-changes
---

# The release PR's apply check is its own job, release-applied

An app with the template's `ci.yml` gets the job on its next upgrade and changes nothing. An app that owns `.github/workflows/ci.yml` adds the `release-applied` job and drops the `--release` flag and its env from the `privileged-changes` step: the apply now reruns a job named `release-applied`, and `privileged-check.ts` no longer takes `--release`.

## What & why

The release PR's comparison with the last apply moved out of `privileged-changes`, whose summary read "nothing only an operator writes changes" above "cannot take this release yet", into a job of its own, `release-applied`, with a summary that names the owed apply. The apply now reruns that job, and only once the PR's CI run has ended: GitHub reruns no job of a run in progress, which left cella 0.45.0 red for two hours after its apply.

## Blast radius

Every app that merges release-please PRs. One with the template's `ci.yml` is unaffected. One that rewrote the `privileged-changes` step keeps passing `--release` to a task that ignores it: its release PR never waits for an apply, and the apply reruns nothing. No database, cache or lens change.

## Run

No script: manual.

## Manual steps

1. Only with an app-owned `.github/workflows/ci.yml`: copy the `release-applied` job from the template's `ci.yml`, add it to the `needs` of `ci-passed`, and remove `REPOSITORY_VARIABLES`, `RELEASE_FLAG` and `$RELEASE_FLAG` from the `privileged-changes` step.

## Verify

The next release PR shows a `release-applied` check whose summary reads "<env> takes this release", or names the apply it owes. Then `pnpm check`.
