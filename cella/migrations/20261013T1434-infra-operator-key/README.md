---
syncBreaking: false
clientCacheBump: false
---

# The infra CLI runs on an operator key, and reads no key or passphrase from disk

Each stack gets an operator key that Scaleway accepts from a dedicated IP address only: run `pnpm infra operator-key`
once per stack with an Owner API key, and store what it shows in a password manager. The CLI then asks for that key's
secret key once per run. `PULUMI_CONFIG_PASSPHRASE` and `SCW_OWNER_*` in `infra/.env.<mode>`, `backend/.env` or the shell
are no longer read, and `pnpm infra store-passphrase` is gone: remove those lines and the keychain entries.

## What & why

Nothing on an operator machine may be enough to change infrastructure. `acquirePrivilegedKey`
(`infra/cli/actions/operator-unlock.ts`) mints a 30-minute key of the `<slug>-<mode>-operator` application per action.
The passphrase moves to Secret Manager (`/<slug>-<mode>/engine/pulumi-passphrase`) and is fetched with that key. A stack
without an operator application still takes an Owner API key at the prompt.

## Blast radius

Operators of every app. Not sync-breaking: no database, cache, stack or config change, and CI is untouched. An operator
who kept the passphrase or an Owner API key in an env file or the keychain is asked at the prompt from now on.

## Run

No script: manual.

## Manual steps

1. Per stack, on the dedicated address: `pnpm infra operator-key` with an Owner API key; store the key it shows.
2. Run one action, for example `pnpm infra apply`: it asks the passphrase once and stores it in Secret Manager.
3. Delete `PULUMI_CONFIG_PASSPHRASE`, `SCW_OWNER_ACCESS_KEY` and `SCW_OWNER_SECRET_KEY` from `infra/.env.<mode>` and shell profiles.
4. Delete the keychain entries `<slug>-<mode>/PULUMI_CONFIG_PASSPHRASE` and any Owner API key kept there.
5. Replace `pnpm infra store-passphrase` in app-owned runbooks: there is no stored passphrase to manage.

## Verify

```sh
pnpm infra status
pnpm --filter infra test
pnpm check
```
