---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: pnpm infra:compose && pnpm --filter infra cli, Show status, Show runs, Start a deploy, Manage runtime secrets, Open public DB access, Close public DB access, Rotate keys & secrets, Repair stack, Unlock stack, Tear down stack, INFRA_ADMIN_EMAIL, --defaults
---

# The infra CLI opens on a home screen and guides setup, deploys and rollbacks

Set the root `package.json` script to `"infra": "pnpm --silent --filter infra cli"`, rename each retired menu label the app's own docs or scripts name (Show status, Show runs, Start a deploy, Manage runtime secrets, Open or Close public DB access, Rotate keys & secrets, Repair stack, Unlock stack, Tear down stack), set `INFRA_ADMIN_EMAIL` wherever a first setup runs under `--defaults`, and run `pnpm infra apply --mode <env>` once per environment, so `control/<mode>/applied.json` keeps the description beside its hash.

## What & why

`pnpm infra` opens on a home screen (`infra/cli/home.ts`) above a menu by task, one letter per row: labels changed, action ids did not, and `releases` is new. A first setup follows a launch checklist, mints its operator key and requires the admin email. Deploy now says whose side a failure is on. `applied.json` and release manifests gain `describes`, so apply needed names the changed fields. The aim: a Heroku user reaches a URL and a rollback unaided.

## Blast radius

Every app that deploys with the infra CLI. Breaking for the app's root `infra` script, its own docs or scripts naming a retired label, and a `--defaults` first setup without `INFRA_ADMIN_EMAIL`. `describes` is compatible: readers accept records without it. No database, cache or lens change.

## Run

No script: manual.

## Manual steps

1. In the root `package.json`, set `"infra": "pnpm --silent --filter infra cli"`: the CLI writes `infra/compose.gen.yml` itself and says so when it changed. `infra:compose` may stay for CI.
2. In the app's own docs and scripts, rename: Show status to Full status, Show runs to Deploy logs, Start a deploy to Deploy now, Manage runtime secrets to Env vars & secrets, Open public DB access to Open DB access, Close public DB access to Close DB access, Rotate keys & secrets to Operators & keys, Repair stack to Repair, Unlock stack to Unlock, Tear down stack to Tear down.
3. A menu path that named **Review & apply changes** as a row reads **Infrastructure changes** → **Review & apply changes**; a script that runs `pnpm infra <id>` needs no change.
4. A script or CI job that runs a first setup under `--defaults` sets `INFRA_ADMIN_EMAIL`: the setup now stops without it.
5. Run `pnpm infra apply --mode <env>` once per environment. Until then `applied.json` holds the hash alone, and a release that waits for an apply shows the two hashes without naming its fields.

## Verify

`pnpm infra` opens on the home screen, and **Releases & roll back** lists the environment's releases. After the apply, `control/<mode>/applied.json` in the boot-diag bucket holds `describes`.

```sh
pnpm check
```
