---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: resolveQueryOrgTenantIds(meta, meta: { organizationId, meta: { tenantId
---

# Query meta carries no organization or tenant

`QueryMeta` has no `organizationId` or `tenantId`, and `resolveQueryOrgTenantIds(cached, resource)` takes no meta. In each product module's `query.ts`, the detail query default calls `resolveQueryOrgTenantIds(cached, '<type>')`, and its `queryFn` destructures `{ queryKey }` only.

## What & why

The stream handler's detail fetch of a change row without a sequence position was the only code that set `meta: { organizationId, tenantId }` on a query, and it went with that fetch. The meta branch of `resolveQueryOrgTenantIds` read a value nothing writes, so a detail query default resolves the organization and tenant from the cached row, then from the current route.

## Blast radius

Breaking for an app with product modules of its own: each detail query default passes `meta` as the first argument, which typecheck flags. The template's attachment module arrives changed. No database, cache version or lens change.

## Run

No script: manual.

## Manual steps

1. raak `frontend/src/modules/task/query.ts`: `resolveQueryOrgTenantIds(meta, cached, 'task')` becomes `resolveQueryOrgTenantIds(cached, 'task')`.
2. raak `frontend/src/modules/label/query.ts`: `resolveQueryOrgTenantIds(meta, cached, 'label')` becomes `resolveQueryOrgTenantIds(cached, 'label')`.
3. projectcampus `frontend/src/modules/comment/query.ts`: `resolveQueryOrgTenantIds(meta, cached, 'comment')` becomes `resolveQueryOrgTenantIds(cached, 'comment')`.
4. projectcampus `frontend/src/modules/label/query.ts`: `resolveQueryOrgTenantIds(meta, cached, 'label')` becomes `resolveQueryOrgTenantIds(cached, 'label')`.
5. projectcampus `frontend/src/modules/item/query.ts`: `resolveQueryOrgTenantIds(meta, cached, 'item')` becomes `resolveQueryOrgTenantIds(cached, 'item')`.
6. projectcampus `frontend/src/modules/material/query.ts`: `resolveQueryOrgTenantIds(meta, cached, 'material')` becomes `resolveQueryOrgTenantIds(cached, 'material')`.
7. In each of these defaults, `queryFn: ({ queryKey, meta })` becomes `queryFn: ({ queryKey })`.
8. App code that sets `meta: { organizationId, tenantId }` on a query of its own drops those two fields; the detail default reads the cached row.

## Verify

```sh
pnpm check
```
