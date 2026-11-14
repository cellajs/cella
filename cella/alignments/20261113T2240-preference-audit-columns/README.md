---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: systemRolesTable.updatedAt, notificationPreferencesTable
generate: true
---

# Notification preferences carry audit columns, system roles lose updatedAt

Every app runs `pnpm generate`: `notification_preferences` gains `created_at`, `created_by` and `updated_by` from
`auditColumns()`, and `system_roles` loses the `updated_at` nothing wrote. App code reading `systemRolesTable.updatedAt`
fails to compile.

## What & why

`notification_preferences` had `updatedAt` without a writer, set by a raw `getIsoDate()`; it now spreads
`auditColumns()` and `updatePreferences` writes through `updateStamps` as the user. `memberships` spreads
`auditColumns()` for the four columns it wrote by hand, with no schema change. `system_roles.updated_at` was never
written and is dropped.

## Blast radius

Every app for the migration. An app that writes `notification_preferences` in its own code passes `updateStamps`
from then on. No wire or cache change.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`: it adds the three columns with their foreign keys to `actors` and drops `system_roles.updated_at`. `hints.json` is empty and `data.sql` holds no statement.
2. Replace a hand-set `updatedAt` on `notification_preferences` in app code with `updateStamps(userId)`.

## Verify

```sh
pnpm generate   # a second run reports no changes
pnpm check
```
