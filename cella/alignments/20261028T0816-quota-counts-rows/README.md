---
syncBreaking: false
clientCacheBump: false
grep: getOrganizationEntityCount, assertTenantQuota
---

# A tenant quota counts the rows it limits

The attachment create compares the tenant's attachment quota with `countTenantEntityRows(ctx, { entityType })`, a count
of the tenant's live rows, in place of `getOrganizationEntityCount`, which reads the CDC worker's counter row. App
creates that copied the old call into their own quota check switch the same way.

## What & why

The counter row is written by the CDC worker, so while the worker lags or is down, creates passed the quota, and REST
must not depend on the worker. The quota is the tenant's, so the count is the tenant's too, as the service account and
API key quotas count theirs. `getOrganizationEntityCount` stays for list totals.

## Blast radius

Not sync-breaking: app code keeps compiling and its quotas keep their current behavior until switched. No database,
lens or `clientCacheVersion` change. Known sites, under `backend/src/modules`: raak `label/operations/create-labels.ts`,
`project/operations/create-projects.ts`, `task/operations/create-tasks.ts`, `workspace/operations/create-workspaces.ts`;
projectcampus `comment`, `course`, `course-section`, `item`, `label`, `material`, `project` (each `operations/create-*.ts`).

## Run

No script: manual.

## Manual steps

1. In each app-owned create that calls `assertTenantQuota`, replace `getOrganizationEntityCount(ctx, { organizationId, entityType })` with `countTenantEntityRows(ctx, { entityType })` from `#/modules/entities/entities-queries`.

## Verify

```sh
pnpm check
```
