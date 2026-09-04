# Organization is the spine, not a configurable root

## What & why

The hierarchy no longer models a swappable root channel: `organization` is declared with
`organization({ roles, elevated })`, the only parentless entity, and `channel()` requires a parent.
Removed: `hierarchy.rootChannelType`, `RootChannelType`, `rootRoles`/`getRootRole` (now
`organizationRoles`/`getOrganizationRole`), `resolveRootMembershipRole` (now
`resolveOrganizationMembershipRole`), `rootChannelId` on `buildTestEntityHierarchyPlan` (now
`organizationId`). Organization-bound tables call `organizationForeignKey(table)`. `getValidProduct`
requires tenant + organization scope and compares both; `getValidChannel` compares what the context
set. Reverses step 3 of `20260902T0939-role-vocabulary-from-hierarchy`.

## Blast radius

Sync-breaking for every app: `pnpm check` fails on the removed symbols and on
`.channel('organization', { parent: null, … })`. No DB or wire change; foreign-key names are
unchanged, so `pnpm generate` is a no-op. A product route calling `getValidProduct` without both
`tenantGuard` and `orgGuard` now fails with a 500 on first call.

## Run

No script: manual. Every replacement is a literal, listed below.

## Manual steps

1. `shared/config/hierarchy-config.ts`: `.channel('organization', { parent: null, roles, elevated })` becomes `.organization({ roles, elevated })`; `rootRoles:` on sub-organization channels becomes `organizationRoles:`.
2. Replace `hierarchy.rootChannelType` with `'organization'`, `RootChannelType` with `'organization'`, `EntityIdColumnKey<RootChannelType>` with `'organizationId'`, and `appConfig.entityIdColumnKeys[hierarchy.rootChannelType]` with `'organizationId'`.
3. Replace root-detection idioms with the literal: `channelTypes.find((t) => getParent(t) === null)`, `getOrderedAncestors(x).at(-1)`, `[...ancestors].reverse()[0]`, `getParent(a) === null`.
4. Rename `getRootRole` to `getOrganizationRole` and `resolveRootMembershipRole` to `resolveOrganizationMembershipRole`.
5. Tests calling `buildTestEntityHierarchyPlan({ rootChannelId })` pass `organizationId` instead.
6. App tables with a hand-written `(tenantId, organizationId)` foreign key to `organizations` use `organizationForeignKey(table)` from `#/db/utils/organization-foreign-key`; drop the `foreignKey` and `organizationsTable` imports if unused.
7. Where comparing an ancestor to `'organization'` narrows a single-channel union to `never`, compare `(x as string)`; multi-channel apps never hit this.
8. Every product route that reaches `getValidProduct` carries `tenantGuard` + `orgGuard`.

## Verify

```sh
grep -rnE "rootChannelType|RootChannelType|getRootRole|rootRoles|resolveRootMembershipRole|rootChannelId" --include="*.ts" --include="*.tsx" backend frontend shared cdc yjs   # must be empty
pnpm generate   # must not emit a migration
pnpm check
pnpm test:core
```
