# Operator credentials and privileged runs in the infra CLI

## What & why

`infra/.env.<mode>` now holds the admin application key as `SCW_ACCESS_KEY` / `SCW_SECRET_KEY`;
`SCW_STATE_ACCESS_KEY` / `SCW_STATE_SECRET_KEY` are deprecated. Apply validates its bootstrap key,
previews and confirms once, verifies live grants and privileges afterwards, and holds a renewed
stack lease. A read-only preflight names owed Applies in the deploy and on the release PR
(`infra-preflight` job). `keychain:` / `op:` references resolve on load.

## Blast radius

Every app's operators and its release PR. Not sync-breaking, no DB or cache change. Synced code and
workflows arrive migrated; only each operator machine's `infra/.env.<mode>` needs the manual steps.

## Run

No script: manual.

## Manual steps

1. On each operator machine: `pnpm infra` → Manage keys & secrets → Fetch operator credentials (a bootstrap key once) writes the admin key; then delete `SCW_STATE_ACCESS_KEY` / `SCW_STATE_SECRET_KEY` from `infra/.env.<mode>`.
2. Optional: Manage keys & secrets → Store passphrase in keychain; optional `SCW_OWNER_ACCESS_KEY` / `SCW_OWNER_SECRET_KEY` (a `keychain:` or `op:` reference to your Owner Personal API Key) so privileged runs mint and revoke their own bootstrap key.
3. The `infra-preflight` CI job needs the production Environment's secrets on release PRs, exactly as the deploy job does; add `infra-preflight` to the branch ruleset's required checks once it has run green.

## Verify

```sh
pnpm infra   # prints "Key: SCW_ACCESS_KEY … (admin application)" and no SCW_STATE_* warning before the menu
pnpm --filter infra test
pnpm check
```
