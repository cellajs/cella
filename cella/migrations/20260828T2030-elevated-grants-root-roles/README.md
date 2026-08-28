# Per-channel elevatedGrants and explicit rootRoles

## What & why

Two hierarchy seams replace implicit permission behavior with declared config. The global
`elevatedRoles` list is gone from `shared/config/permissions-config.ts` (and from the `shared`
exports): each hierarchy channel now declares `elevated` — the roles whose product grants cover
that channel's whole subtree — and the builder compiles them into `hierarchy.elevatedGrants`
(`${channelType}:${role}` keys) consumed by the engine check, the collection-scope SQL compiler
and the frontend view derivation. Separately, auto-created root context memberships take their
role from the source channel's explicit `rootRoles` map instead of an implicit `member`
preference: `resolveParentMembershipRole` split into `resolveAssociatedMembershipRole` (associated
memberships, least-privileged fallback, `carryRole` unchanged) and `resolveRootMembershipRole`,
which throws when the channel declares no map.

## Blast radius

Sync-breaking for every fork. `pnpm check` fails after sync on any import of `elevatedRoles`, on
calls to `resolveParentMembershipRole`, and on `elevatedRoles` options passed to the engine or
view derivation. Behavior also shifts silently where config is not updated: with no `elevated`
declarations the compiled set is empty and **every product grant at a non-home ancestor level
becomes home-scoped** — previously `elevatedRoles: undefined` meant every grant was
subtree-scoped. A fork with a multi-level hierarchy that skips step 1 below loses subtree reads
for every role. Membership escalation tightens the same way: a channel whose invites auto-create
root membership rows now throws at insert time without a complete `rootRoles` map. No database or
wire-shape change; `clientCacheVersion` untouched.

## Run

No script — manual. Config declarations are app decisions a codemod cannot make.

## Manual steps

1. In `shared/config/hierarchy-config.ts`, add `elevated: [...]` to each channel for the roles
   whose grants must cover the channel's subtree. To reproduce the old `elevatedRoles: ['x']`
   semantics exactly, declare role `x` elevated on every channel that has it (the
   `elevateAcross` helper in `shared/src/testing/elevate.ts` shows the equivalence); cella's
   default declares `elevated: roles.all` on `organization`.
2. Remove the `elevatedRoles` export from `shared/config/permissions-config.ts`.
3. On every non-root channel whose invites auto-create root membership rows (menuStructure
   submenus and associated types), declare a complete `rootRoles` map — every role of the channel
   mapped to a root-channel role. Build-time validation rejects partial maps.
4. Rename fork-local calls of `resolveParentMembershipRole` to `resolveAssociatedMembershipRole`;
   root-row call sites use `resolveRootMembershipRole`.
5. In fork-local tests that passed `elevatedRoles: [...]` to `getAllDecisions`,
   `resolveCollectionReadFilter` or `deriveGrantBoundaryViews`, pass
   `elevatedGrants: elevateAcross(hierarchy, [...])` (or an explicit key set) instead.

## Verify

```sh
pnpm check
pnpm test:core
```

`grep -rn "elevatedRoles\|resolveParentMembershipRole" --include="*.ts" .` (outside node_modules)
must come back empty. Exercise one org member's catchup/sync after deploy: an org view answering
`opaque` instead of `ok` means a missing `elevated` declaration.
