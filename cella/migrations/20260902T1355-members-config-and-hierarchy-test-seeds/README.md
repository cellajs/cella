# Members table config seam and hierarchy-aware test seeds

## What & why

Two things landed together, both distilled from fork drift after the 2026-09-02 syncs.

**Members table config seam.** `frontend/src/modules/memberships/members-table/members-columns.tsx`
hardcoded the icon per product stat (`memberStatIcons`) and offered no way to hide a count column
by default. Apps with their own product types (projectcampus: item and comment) had to edit the
template file. Both knobs now live in the new pinned, app-owned `frontend/src/members-config.ts`:
`memberStatIcons` (icon per `appConfig.memberStatProductTypes` entry, `BoxIcon` fallback) and
`hiddenMemberCountColumns` (product and sub-channel `${type}Count` columns hidden until the user
toggles them on). Cella ships the attachment paperclip and hides nothing.

**Hierarchy-aware test seeds.** Since the ancestor foreign keys of `channelRelationColumns`
(20260902T0906), invented ancestor ids no longer insert. Three template files now derive them:

- `backend/src/mocks/product-mock-registry.ts`: `buildInsertableProduct` inserts nullable
  ancestors as null unless overridden (`hierarchy.getNullableAncestors`).
- `backend/tests/integration/cdc-event-bus.test.ts` (full mode): seeds the attachment's ancestor
  chain through `buildTestEntityHierarchyPlan` and `seedEntityHierarchy`, then spreads
  `plan.channelIdColumns` into the insert.
- `yjs/src/tests/integration/permissions.test.ts`: seeds every `ancestorColumns` entry of nested
  channel rows, not only the parent.

All three are no-ops on cella's org-only hierarchy; they exist for apps with nested channels.

## Blast radius

Not sync-breaking, no `clientCacheVersion` bump, no database change. An app that never touched
`members-columns.tsx` and never patched these tests is unaffected beyond taking upstream and
adding the pin. raak and projectcampus carry fork-marked versions of the three test and mock files
that are byte-for-byte the upstream logic with a different comment; the sync merge reports them as
diverged on that comment hunk only.

## Run

No script — manual.

## Manual steps

1. Add `'frontend/src/members-config.ts'` to `pinned` in `cella/cella.config.ts` (next to
   `placement-config.ts`).
2. If your `members-columns.tsx` drifted for icons or default-hidden columns, move those values
   into `frontend/src/members-config.ts` (`memberStatIcons`, `hiddenMemberCountColumns`) and take
   upstream for `members-columns.tsx`.
3. Take upstream for `backend/src/mocks/product-mock-registry.ts`,
   `backend/tests/integration/cdc-event-bus.test.ts` and
   `yjs/src/tests/integration/permissions.test.ts` if your copies carry the fork-marked version of
   the same change (only the comment differs).

## Verify

```sh
pnpm cella analyze
pnpm check
pnpm test
```

`cella analyze` should list none of the four files as drifted or diverged; `members-config.ts`
shows as protected.
