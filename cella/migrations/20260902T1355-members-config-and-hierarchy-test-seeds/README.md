# Members table config seam and hierarchy-aware test seeds

## What & why

**Members config seam.** `memberStatIcons` (icon per `appConfig.memberStatProductTypes` entry,
`BoxIcon` fallback) and `hiddenMemberCountColumns` (product and sub-channel `${type}Count` columns
hidden until toggled on) move out of
`frontend/src/modules/memberships/members-table/members-columns.tsx` into the new pinned
`frontend/src/members-config.ts`.

**Hierarchy-aware test seeds.** Since `channelRelationColumns` (20260902T0906) adds ancestor
foreign keys, invented ancestor ids no longer insert: `buildInsertableProduct`
(`backend/src/mocks/product-mock-registry.ts`) inserts nullable ancestors as null unless overridden
(`hierarchy.getNullableAncestors`); `backend/tests/integration/cdc-event-bus.test.ts` (full mode)
seeds the ancestor chain through `buildTestEntityHierarchyPlan` and `seedEntityHierarchy` and
spreads `plan.channelIdColumns` into the insert; `yjs/src/tests/integration/permissions.test.ts`
seeds every `ancestorColumns` entry of nested channel rows. No-ops on cella's org-only hierarchy.

## Blast radius

Not sync-breaking, no `clientCacheVersion` bump, no DB change. Apps that never touched
`members-columns.tsx` or these tests only take upstream and add the pin.

## Run

No script: manual.

## Manual steps

1. Add `'frontend/src/members-config.ts'` to `pinned` in `cella/cella.config.ts` (next to
   `placement-config.ts`).
2. If your `members-columns.tsx` drifted for icons or default-hidden columns, move those values
   into `frontend/src/members-config.ts` (`memberStatIcons`, `hiddenMemberCountColumns`) and take
   upstream for `members-columns.tsx`.
3. Take upstream for `backend/src/mocks/product-mock-registry.ts`,
   `backend/tests/integration/cdc-event-bus.test.ts` and
   `yjs/src/tests/integration/permissions.test.ts` if your copies carry the fork-marked version
   (raak and projectcampus: same logic, comment hunk only).

## Verify

```sh
pnpm cella analyze   # none of the four files drifted or diverged; members-config.ts shows as protected
pnpm check
pnpm test
```
