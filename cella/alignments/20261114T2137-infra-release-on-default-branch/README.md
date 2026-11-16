---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: MainJobEffects
---

# A release deploys only from the default branch

After the upgrade, run `pnpm infra apply --mode <env>` once per environment that deploys releases, which publishes the engine with the rule. From then on production deploys a release only when the repository's default branch contains its commit. An app that tags releases on another branch merges them first.

## What & why

Production deployed the newest `X.Y.Z` tag on any commit: the right to push a tag alone chose what ran. The main job now also asks `defaultBranchContains` (`lib/deploy/git-remote.ts`) before a deploy starts: a release outside the default branch ends its run failed, with that reason in its record. A deploy needs the tag ruleset and the default branch's ruleset together. `MainJobEffects` gains `onDefaultBranch`.

## Blast radius

Every environment that deploys releases, once its apply ran. An app whose release flow tags commits of the default branch, as `release.yml` does, sees no change. An app's own fake of `MainJobEffects` fails typecheck. No database, cache or lens change.

## Run

No script: manual.

## Manual steps

1. List release tags the default branch does not contain, with the command under Verify; merge or delete each one production may still deploy.
2. Run `pnpm infra apply --mode <env>` for each environment that deploys releases.
3. Add `onDefaultBranch` to an app's own fake of `MainJobEffects`, which typecheck names.

## Verify

```sh
git fetch origin --tags
# origin's tags only: refs/tags can also hold the template's, written by a fetch of cella-upstream
git ls-remote --tags --refs origin '[0-9]*.[0-9]*.[0-9]*' | while read -r sha ref; do
  git merge-base --is-ancestor "$sha" origin/main 2>/dev/null || echo "${ref#refs/tags/}"
done
pnpm check
```
