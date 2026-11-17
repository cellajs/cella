---
breaking: false
clientCacheBump: false
grep: draft-pull-request, pull-request-header, schema-bust-gate, privileged-changes
---

# The release PR opens as a draft and runs its checks once ready

Add `"draft-pull-request": true` to the app-owned `.github/release-please-config.json` and convert the open release PR
to a draft. Its refreshes then run no CI job until it is marked ready for review.

## What & why

`ci.yml` runs the heavy suites and `release-applied` on a release or upgrade PR once it is ready for review, and skips
every job of a draft release PR; `ci-passed` reports as `ci-passed (draft)` on a draft. `schema-bust-gate` and
`privileged-changes` are steps of `lint`. GitHub bills each job by the started minute, and a private app's release PR
ran every suite on each merge to main.

## Blast radius

Apps that merge release-please PRs. Not breaking: without the key the release PR opens ready and runs every suite on
each refresh, as before. An app's own CI jobs run on a draft release PR until they take the condition `lint` carries.
No database, cache or lens change.

## Run

No script: manual.

## Manual steps

1. In `.github/release-please-config.json`, add `"draft-pull-request": true` and copy the template's `pull-request-header`.
2. Convert the open release PR to a draft: `gh pr ready <number> --undo`.
3. Give each app-owned job in `.github/workflows/ci.yml` the `if:` that `lint` carries.

## Verify

The next release PR refresh shows every CI job skipped and `ci-passed (draft)` green. Marking the PR ready for review
runs every job and `ci-passed`. Then `pnpm check`.
