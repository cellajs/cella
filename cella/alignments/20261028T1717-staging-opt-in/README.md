---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: infra/environments
---

# Staging deploys only while infra/environments has its line

Production always deploys; any other environment deploys only while `infra/environments` has a line for it. An app that
deploys staging adds `staging branch:main` to that file, then moves `infra/runner.json`'s `release` to a commit with this
change and runs `pnpm infra runner-replace`. An app without staging leaves the line out.

## What & why

`resolveTarget` in `infra/lib/deploy/target.ts` finds no target for an environment other than production without a line:
the runner starts nothing for it, `pnpm infra start-deploy` refuses and names the line to add, and `infra status` flags a
stack set up without a line (`environments.lines`). A staging environment costs as much as its machines, so each app decides
whether it runs one. The install wizard defaults to production.

## Blast radius

Every app with a staging stack, for operations only. The runner runs the code its `release` pins, so staging keeps
deploying until the runner is replaced on a commit with this change. raak has no staging stack: it only moves the pin. No
database, cache or wire change.

## Run

No script: manual.

## Manual steps

1. An app that deploys staging: add the line `staging branch:main` to `infra/environments` and merge it.
2. Move `infra/runner.json`'s `release` to a commit of the default branch that has this change, merge it, then run `pnpm infra runner-replace` (operator key).
3. An app that wants no staging leaves the line out; a staging stack still costs until `pnpm infra teardown --mode staging`, staging dropped from `infra/runner.json` and `pnpm infra runner-replace`.

## Verify

```sh
pnpm --filter infra status --mode production   # environments.lines: ok, every stack set up has its line
pnpm check
```
