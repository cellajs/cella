---
breaking: false
clientCacheBump: false
generate: true
grep: deleteAccounts, last_admin
---

# Deleting an account takes the organizations no one else could manage

Run `pnpm generate` for the new `memberships_keep_org_admin` function. Afterwards the last admin of an organization can delete their account once the organization is deleted, and an organization whose other members have no proven address is deleted with the account instead of refusing it with `last_admin`.

## What & why

The trigger exempted only an organization whose row was gone. Deleting an organization archives its tenant and leaves the row to the sweep for `archivedTenantDays`, and its last admin could not delete their account all that time. The trigger now also exempts an archived tenant's organization, and `deleteAccounts` archives each organization `findOrganizationsHeldOnlyBy` returns, in the same transaction. `hasProvenEmail` takes any user-id column.

## Blast radius

Every app, not breaking. Until the generated migration runs, the old trigger refuses these deletions with `last_admin` as before. An app test expecting `last_admin` for a sole admin whose other members have no `emails` row now gets 204. No cache or lens change.

## Run

No script: manual.

## Manual steps

1. `pnpm generate`: a new `_side_effects` folder whose only change is the `memberships_keep_org_admin` function.

## Verify

`pnpm --filter backend test tests/security/last-admin.test.ts`, then `pnpm check`.
