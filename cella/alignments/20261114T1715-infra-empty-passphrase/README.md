---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: resolveVerifiedPassphrase, resolveOrCreatePassphrase, PULUMI_CONFIG_PASSPHRASE, passphrase-custody, pulumi-passphrase
---

# Every stack takes the empty Pulumi passphrase

After the upgrade, run `pnpm infra apply --mode <env>` once per environment before any other action that runs Pulumi. Before its plan it moves the stack off the passphrase its engine folder keeps and deletes that copy. Then commit `infra/Pulumi.<mode>.yaml`, whose `encryptionsalt` changed. The recovery passphrase in your password manager has no further use.

## What & why

The state holds no machine and no secret value, so the passphrase guarded a public CA certificate. Gone: `resolveVerifiedPassphrase`, `lib/stack/pulumi-passphrase.ts`, `tasks/passphrase-custody.ts`, the passphrase a setup showed once, and its prompt in eight actions. `buildProviderEnv` sets `PULUMI_CONFIG_PASSPHRASE` empty. `dropKeptPassphrase` in the apply moves an existing stack once, with `pulumi stack change-secrets-provider`, and goes once every environment passed it.

## Blast radius

Every environment set up before this change. Until its apply ran, each action that runs Pulumi ends with "incorrect passphrase". An app's own script that passes `passphrase` to `buildProviderEnv` fails typecheck. No database, cache or lens change.

## Run

No script: manual.

## Manual steps

1. Before the upgrade, for an environment whose `/engine/` folder keeps no `pulumi-passphrase`: `pnpm infra preview --mode <env>` and type the passphrase, which stores it there.
2. After the upgrade: `pnpm infra apply --mode <env>`, which moves the stack and deletes `pulumi-passphrase` before it plans.
3. Commit and push `infra/Pulumi.<mode>.yaml`: every other checkout needs the new `encryptionsalt`.
4. Remove `passphrase` from an app's own call of `buildProviderEnv`, which typecheck names.

## Verify

```sh
pnpm infra preview --mode <env>
pnpm check
```
