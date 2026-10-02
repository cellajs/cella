---
syncBreaking: false
clientCacheBump: false
---

# Operator API keys and privileged runs in the infra CLI

Keys are named after their Scaleway bearer: the Owner API key (SCW_OWNER_*, your own key as
organization Owner; a durable one mints a 30-minute key per privileged run) and the admin
application key (SCW_ADMIN_* in infra/.env.<mode>; setup writes it, Fetch admin application key does
elsewhere). SCW_BOOTSTRAP_* and SCW_STATE_* are read for one release with rename warnings. Apply
validates the key, previews and confirms once, and verifies live grants and database privileges
afterwards. Stack locks are renewed leases released on Ctrl-C. A preflight names owed Applies in the
deploy and in the infra-preflight job on release PRs. keychain: and op: references resolve when the
env file loads. Synced files arrive migrated; operators update their infra/.env.<mode> once.

## What & why

Keys are named after their Scaleway bearer. Your own key as organization Owner is the **Owner API key**
(`SCW_OWNER_ACCESS_KEY` / `SCW_OWNER_SECRET_KEY`, usually a `keychain:` or `op:` reference): every
privileged action (Apply, Teardown, Reset database, DB exposure, seeding, Manage runtime secrets, the
admin key fetch) validates it first and, when it is a durable key, mints a 30-minute key for the run.
The **admin application key** lives in `infra/.env.<mode>` as `SCW_ADMIN_ACCESS_KEY` /
`SCW_ADMIN_SECRET_KEY`; the file's old `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` pair, `SCW_STATE_*` and
`SCW_BOOTSTRAP_*` are read for one release with rename warnings. Apply previews and confirms once,
verifies live grants and privileges afterwards, and holds a renewed stack lease. A read-only preflight
names owed Applies in the deploy and on the release PR (`infra-preflight` job).

## Blast radius

Every app's operators and its release PR. Not sync-breaking, no DB or cache change. Synced code and
workflows arrive migrated; only each operator machine's `infra/.env.<mode>` needs the manual steps.
GitHub Environment secrets keep their names: `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` are what the Scaleway
provider reads.

## Run

No script: manual.

## Manual steps

1. On each operator machine: put your Owner API key in `infra/.env.<mode>` as `SCW_OWNER_ACCESS_KEY` / `SCW_OWNER_SECRET_KEY` (a `keychain:` or `op:` reference), or be ready to paste one.
2. `pnpm infra` → Manage keys & secrets → Fetch admin application key: writes `SCW_ADMIN_*` and removes the superseded `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` / `SCW_STATE_*` lines. Remove a `SCW_BOOTSTRAP_*` pair yourself.
3. Optional: Manage keys & secrets → Store passphrase in keychain.
4. The `infra-preflight` CI job needs the production Environment's secrets on release PRs, exactly as the deploy job does; add `infra-preflight` to the branch ruleset's required checks once it has run green.

## Verify

```sh
pnpm infra   # prints "Admin application key: … (admin application)" and no rename warning before the menu
pnpm --filter infra test
pnpm check
```
