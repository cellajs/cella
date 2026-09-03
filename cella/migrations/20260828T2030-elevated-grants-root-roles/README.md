# Per-channel elevatedGrants and explicit rootRoles

## What & why

The global `elevatedRoles` list is gone from `shared/config/permissions-config.ts` and the `shared`
exports: each hierarchy channel declares `elevated` (roles whose product grants cover its subtree),
compiled into `hierarchy.elevatedGrants` (`${channelType}:${role}` keys) for the engine, the
collection-scope SQL compiler and view derivation. Auto-created root memberships take
their role from the source channel's explicit `rootRoles` map: `resolveParentMembershipRole` split
into `resolveAssociatedMembershipRole` (associated memberships, least-privileged fallback,
`carryRole` unchanged) and `resolveRootMembershipRole`, which throws without a map.

## Blast radius

Sync-breaking for every fork: `pnpm check` fails on `elevatedRoles` imports,
`resolveParentMembershipRole` calls and `elevatedRoles` options passed to the engine or view
derivation. With no `elevated` declarations **every product grant at a non-home ancestor level
becomes home-scoped** (previously subtree-scoped): a multi-level fork skipping step 1 loses subtree
reads. Invites auto-creating root membership rows throw without a complete `rootRoles` map. No DB
or wire change; `clientCacheVersion` untouched.

## Run

No script: manual.

## Manual steps

1. In `shared/config/hierarchy-config.ts`, add `elevated: [...]` per channel for the roles whose
   grants must cover its subtree; to reproduce the old `elevatedRoles: ['x']` exactly, declare `x`
   elevated on every channel that has it (`elevateAcross` in `shared/src/testing/elevate.ts` shows
   the equivalence). Cella declares `elevated: roles.all` on `organization`.
2. Remove the `elevatedRoles` export from `shared/config/permissions-config.ts`.
3. On every non-root channel whose invites auto-create root membership rows (menuStructure
   submenus and associated types), declare a complete `rootRoles` map (every channel role to a
   root-channel role); build-time validation rejects partial maps.
4. Rename fork-local `resolveParentMembershipRole` calls to `resolveAssociatedMembershipRole`;
   root-row call sites use `resolveRootMembershipRole`.
5. Fork-local tests passing `elevatedRoles: [...]` to `getAllDecisions`,
   `resolveCollectionReadFilter` or `deriveGrantBoundaryViews` pass
   `elevatedGrants: elevateAcross(hierarchy, [...])` (or an explicit key set) instead.

## Verify

```sh
pnpm check
pnpm test:core
grep -rn "elevatedRoles\|resolveParentMembershipRole" --include="*.ts" .   # outside node_modules, must be empty
# after deploy: an org view answering `opaque` instead of `ok` on a member's catchup/sync means a missing `elevated` declaration
```
