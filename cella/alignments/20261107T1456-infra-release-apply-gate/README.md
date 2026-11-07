---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: INFRA_APPLIED_DESCRIPTION_, privileged-check, privileged-changes
---

# The release PR waits for the apply its release owes

Sign in with `gh` on every operator machine, then run `pnpm infra apply --mode <env>` once per environment that follows the releases (production by default): it ends by setting the repository variable `INFRA_APPLIED_DESCRIPTION_<MODE>`. Until then the release PR's `privileged-changes` check fails and the release cannot merge.

## What & why

`privileged-changes` takes `--release` on the release PR and fails while the release's description hash differs from `INFRA_APPLIED_DESCRIPTION_<MODE>`, a repository variable each apply now sets through the operator's `gh`. The apply also reruns a failed release PR check. Before, a release that changed the description merged, tagged, and stopped at **apply needed**: cella 0.40.0 waited an hour on a CSP change.

## Blast radius

Every app that deploys with the infra CLI and merges release-please PRs. A missing variable blocks the release PR until the first apply after the upgrade. An app that rewrote `ci.yml`'s `privileged-changes` step keeps the old, passing check. No database, cache or lens change.

## Run

No script: manual.

## Manual steps

1. On each operator machine: `gh auth login`, with access to the repository's variables (an admin or a maintainer of the repository).
2. Per environment that follows the releases: `pnpm infra apply --mode <env>` from main. It records its engine, and sets the variable, even when its plan holds no other change.
3. An app that owns `.github/workflows/ci.yml`: copy the `REPOSITORY_VARIABLES` and `RELEASE_FLAG` env of the `Say what the change owes` step, and pass `$RELEASE_FLAG` to `tasks/privileged-check.ts`.

## Verify

`gh variable list` names `INFRA_APPLIED_DESCRIPTION_<MODE>` per environment, and the next release PR's `privileged-changes` summary reads "<env> takes this release". Then `pnpm check`.
