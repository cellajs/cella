# Permission vocabulary consolidation

## What & why

Permission naming follows the hierarchy vocabulary (rule in `cella/PERMISSIONS.md`; `subject`
stays the engine-only noun for the checked instance). The legacy `context` vocabulary, the
`Access*`/`Permission*` split, the `topology` wrapper, and `can`/`enabled`/`isAllowed` are gone:

| Old | New |
| --- | --- |
| `AccessPolicies` | `PolicyMatrix` |
| `SubjectAccessPolicies` | `EntityPolicies` |
| `AccessPolicyEntry` | `PolicyEntry` |
| `AccessPolicyCallback` | `PolicyCallback` |
| `AccessPolicyConfiguration` | `PolicyConfiguration` |
| `accessPolicies` (config export) | `policyMatrix` |
| `configureAccessPolicies` (testing) | `configurePolicyMatrix` |
| `getSubjectPolicies` | `getEntityPolicies` |
| `PermissionValue` | `PolicyCellInput` (`Exclude<PolicyCell, 'public'>`) |
| `NormalizedPermissionValue` | `PolicyCell` (`0 \| 1 \| RowConditionName`) |
| `ActionPermissionState` | `CanState` |
| `resolvePermission` | `resolveCan` |
| `isUnconditionalPermission` | `isUnconditionalCan` |
| `PermissionMembership` | `AccessMembership` |
| `PermissionResult.isAllowed` | `PermissionResult.allowed` |
| `ActionAttribution.enabled` | `ActionAttribution.allowed` |
| `PermissionTopology` / `options.topology` | removed; `options.hierarchy` + `options.entityActions` |
| `AncestorScope` / `filter.ancestorScopes` | `IntermediateScope` / `filter.intermediateScopes` |
| `CollectionReadFilter.subChannelIds` | `homeChannelIds` |
| `requested.subChannelId(s)` | `requested.homeChannelId(s)` |
| scope slices' `subChannelIds` | `channelIds` (level given by the slice's `channelType`) |

Config DSL (`shared/config/permissions-config.ts`): the callback receives `({ entityType, channels })`
instead of `({ subject, contexts })`; branch on `entityType`, declare cells via
`channels.<channel>.<role>({ ... })`. Files: `shared/src/permissions/permission-manager/` ->
`shared/src/permissions/engine/`; `check-permission.ts` -> `check-access.ts` (shared and backend);
backend `permissions/actor.ts` -> `permissions/access.ts`; `access-policies.ts` ->
`policy-matrix.ts`; `engine/topology.ts` + `engine/resolve-topology.ts` ->
`engine/resolve-hierarchy.ts` (`HierarchyOverrides`, `resolveHierarchy`); fixtures `wideTopology` /
`deepTopology` -> `wideOverrides` / `deepOverrides`.

## Blast radius

Sync-breaking at the type and config level for every app: `shared/config/permissions-config.ts`
uses the renamed DSL, and code importing renamed symbols stops compiling. No wire-shape change, no
`clientCacheVersion` bump, no lens, no database change; decision logic untouched.

## Run

No script; word-boundary symbol swaps, grep-guided:

```sh
grep -rnE "AccessPolic|accessPolicies|PermissionValue|ActionPermissionState|resolvePermission|isUnconditionalPermission|PermissionMembership|isAllowed|PermissionTopology|topology|subChannel|ancestorScopes|subject, contexts|permission-manager|check-permission" --include="*.ts" --include="*.tsx" backend frontend/src shared yjs/src
```

## Manual steps

1. Apply the table's symbol renames (word-boundary; skip unrelated `isAllowed`/`enabled` outside
   permission code).
2. `configurePermissions` callback: `({ subject, contexts })` -> `({ entityType, channels })`,
   `switch (subject.name)` -> `switch (entityType)`.
3. `options.topology`/`{ topology: { hierarchy: h } }` -> `{ hierarchy: h }` (plus `entityActions`
   if overridden).
4. `git mv` any app-specific imports of the renamed files (`#/permissions/actor` ->
   `#/permissions/access`, `shared/src/permissions/permission-manager/*` -> `.../engine/*`).
5. Collection-scope consumers: rename filter fields per the table (top-level `subChannelIds` ->
   `homeChannelIds`; inside scope slices -> `channelIds`).

## Verify

```sh
pnpm sdk
pnpm check
pnpm --filter shared exec vitest run src/permissions src/testing
pnpm --filter backend exec vitest run src/permissions
```
