# Permission vocabulary consolidation

## What & why

The permission subsystem carried four vocabulary layers that grew across iterations: a legacy
`context` vocabulary for what the hierarchy calls a channel, a half-applied `Access*` /
`Permission*` prefix split, a `topology` wrapper for what the rest of the repo calls the
hierarchy, and three words (`can`, `enabled`, `isAllowed`) for "the action is allowed". This
migration aligns permission naming with the repo's hierarchy vocabulary. The naming rule is now
stated in `cella/PERMISSIONS.md`: Access is the input (who is asking), Policy is the configured
matrix, Permission is the engine's verdict; `subject` remains the one engine-only noun for the
checked instance.

Renamed exports (old → new):

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
| `PermissionResult.isAllowed` | `PermissionResult.allowed` |
| `ActionAttribution.enabled` | `ActionAttribution.allowed` |
| `PermissionTopology` / `options.topology` | removed; `options.hierarchy` + `options.entityActions` |
| `AncestorScope` / `filter.ancestorScopes` | `IntermediateScope` / `filter.intermediateScopes` |
| `CollectionReadFilter.subChannelIds` | `homeChannelIds` |
| `requested.subChannelId(s)` | `requested.homeChannelId(s)` |
| scope slices' `subChannelIds` | `channelIds` (level given by the slice's `channelType`) |

Config DSL (`shared/config/permissions-config.ts`): the callback receives
`({ entityType, channels })` instead of `({ subject, contexts })`; branch on `entityType` and
declare cells via `channels.<channel>.<role>({ ... })`.

Renamed files: `shared/src/permissions/permission-manager/` → `shared/src/permissions/engine/`,
`check-permission.ts` → `check-access.ts` (shared and backend), backend `permissions/actor.ts` →
`permissions/access.ts`, `access-policies.ts` → `policy-matrix.ts`, `engine/topology.ts` +
`engine/resolve-topology.ts` → `engine/resolve-hierarchy.ts` (`HierarchyOverrides`,
`resolveHierarchy`). Test fixtures: `wideTopology` / `deepTopology` → `wideOverrides` /
`deepOverrides`.

## Blast radius

Fork-breaking at the type and config level for every fork: `shared/config/permissions-config.ts`
uses the renamed DSL, and any handler or test importing the renamed symbols stops compiling. No
wire-shape change, no `clientCacheVersion` bump, no lens, no database change. The decision logic
is untouched; the parity property test and the full permission suites pass unchanged apart from
the renames.

## Run

No script. The renames are word-boundary symbol swaps; apply the table above with your editor's
rename-symbol or a grep-guided pass:

```sh
grep -rnE "AccessPolic|accessPolicies|PermissionValue|ActionPermissionState|resolvePermission|isUnconditionalPermission|isAllowed|PermissionTopology|topology|subChannel|ancestorScopes|subject, contexts|permission-manager|check-permission" --include="*.ts" --include="*.tsx" backend frontend/src shared yjs/src
```

## Manual steps

1. Apply the symbol renames from the table (word-boundary; skip unrelated `isAllowed`/`enabled`
   identifiers outside permission code).
2. Rewrite the `configurePermissions` callback signature: `({ subject, contexts })` →
   `({ entityType, channels })`, `switch (subject.name)` → `switch (entityType)`.
3. Replace `options.topology`/`{ topology: { hierarchy: h } }` with `{ hierarchy: h }` (and
   `entityActions` alongside if overridden).
4. `git mv` any fork-local imports of the renamed files (`#/permissions/actor` →
   `#/permissions/access`, `shared/src/permissions/permission-manager/*` → `.../engine/*`).
5. In collection-scope consumers, rename filter fields per the table (`subChannelIds` at the
   top level is `homeChannelIds`; inside scope slices it is `channelIds`).

## Verify

```sh
pnpm sdk
pnpm check
pnpm --filter shared exec vitest run src/permissions src/testing
pnpm --filter backend exec vitest run src/permissions
```
