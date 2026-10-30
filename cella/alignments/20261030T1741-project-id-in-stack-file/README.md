---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: writeModeEnvValues, resolveSecretReference, parseSecretReference
---

# The project id is committed in the stack file; the mode env file holds plain values

Each environment's Scaleway project moves from `infra/.env.<mode>` to `infra/Pulumi.<mode>.yaml`, as `infra:projectId`: the CLI moves it on its next run, and you commit the file. The `keychain:` and `op:` pointers in that env file are gone, so a key stored behind one is pasted as its value.

## What & why

`SCW_PROJECT_ID` is no secret and every checkout needs it, but a gitignored file held it, so a new checkout stopped until someone added it. `resolveModeProject` now reads `infra:projectId`, and setup writes it after `pulumi stack init`. `parseSecretReference` and `resolveSecretReference` are gone: the file's only key is the observer's, which reads metadata.

## Blast radius

Every app with a deployed stack, for operators only. No database, wire or `clientCacheVersion` change. A checkout with no id anywhere stops with the line to add. A checkout whose env file held only the id loses that file.

## Run

No script: manual.

## Manual steps

1. Per environment, once the upgrade is merged: run any infra command, such as `pnpm infra status --mode <env>`, from a checkout whose `infra/.env.<env>` or `backend/.env` names the project. It writes `infra:projectId` to `infra/Pulumi.<env>.yaml`. Commit that file.
2. A checkout with no id: add `infra:projectId: <id>` under `config:` in `infra/Pulumi.<env>.yaml` by hand. The id is in the Scaleway console, and in `infra/runner.json` when a runner serves the environment.
3. In `infra/.env.<mode>`, replace a value that starts with `keychain:` or `op:` with the key itself.
4. Delete `SCW_PROJECT_ID` from `backend/.env`: nothing needs it once the stack file names the project.

## Verify

```sh
grep infra:projectId infra/Pulumi.<env>.yaml   # the environment's project
pnpm infra status --mode <env>                 # Scaleway project: the same id
pnpm check
```
