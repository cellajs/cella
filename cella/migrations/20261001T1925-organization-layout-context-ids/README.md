---
syncBreaking: true
clientCacheBump: false
---

# Organization layout context returns ids

useOrganizationLayoutContext in frontend/src/hooks/use-route-context.ts returns { organizationId,
tenantId } and no longer the organization object. A component that read organization fields from it
reads them through useSuspenseQuery(organizationQueryOptions(organizationId, tenantId)) from
~/modules/organization/query. Test mocks of the hook return the two ids. Shipped in 0.13.0; this
note was added afterwards.

## What & why

`useOrganizationLayoutContext` selects `organizationId` and `tenantId` as two primitives with `useRouterState`. Router match context is rebuilt on every navigation, search-only ones included, so returning the `organization` object re-rendered every caller on each one. The organization itself stays in the query cache under `organizationQueryOptions`.

## Blast radius

Apps with their own components or test mocks that use `useOrganizationLayoutContext`; TypeScript reports each read of `.organization`. No database change, no `clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. `const { organization } = useOrganizationLayoutContext()` becomes `const { organizationId, tenantId } = useOrganizationLayoutContext()`.
2. Where the component needs more than the ids: `const { data: organization } = useSuspenseQuery(organizationQueryOptions(organizationId, tenantId))`.
3. Mocks of `~/hooks/use-route-context` return `{ organizationId, tenantId }`.

## Verify

```sh
pnpm check
```
