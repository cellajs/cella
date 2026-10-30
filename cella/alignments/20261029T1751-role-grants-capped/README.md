---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: organizationRoles, carryRole, role_exceeds_creator, resolveAssociatedMembershipRole, resolveOrganizationMembershipRole
---

# No role grant outranks the granter's own

An app reads its `permissions-config.ts` for a channel role below the first that holds `update` or `delete` on its own
channel, and its `organizationRoles` and `menuStructure` `carryRole` for an invitation that brings along a role above the
inviter's: those invitations, role changes, removals and service-account actions now answer 403 `forbidden` with
`meta.reason: 'role_exceeds_actor'`, which replaces `role_exceeds_creator`.

## What & why

A channel's roles are declared most to least privileged, and that order now decides who may grant what
(`hierarchy.outranks`, `mayGrantRole`, `assertRoleGrant` in `backend/src/permissions/role-grant.ts`). The membership
operations and `getManagedServiceAccount` refuse a role above the actor's own on the channel, and an invitation whose
accept brings along one above it (`membershipsBroughtAlong`). `update` from an ancestor still hands out every role of
the channel, and the least-privileged role and a system admin always pass.

## Blast radius

Behaviour only: no database, lens or cache change. An app is unaffected when, like the template, every holder of channel
`update` or `delete` is that channel's first role or holds it from an ancestor, and every `organizationRoles` value is the
organization's least-privileged role.

## Run

No script: manual.

## Manual steps

1. In `shared/config/permissions-config.ts`, find each self row that gives a role below the channel's first `update` or `delete`: it no longer hands out, demotes or removes a role above its own. Give the elevation row on an ancestor where a role must manage every role.
2. In `shared/config/hierarchy-config.ts` and `menuStructure`, check each `organizationRoles` value and `carryRole` relation against who invites: an inviter whose own role on the organization or the menu parent ranks below the one brought along is refused at invite time.
3. Replace `role_exceeds_creator` with `role_exceeds_actor` where app code or tests read it.
4. `resolveAssociatedMembershipRole` and `resolveOrganizationMembershipRole` take and return a `string` role and an optional hierarchy; the typecheck names an app call site that needs the role column type.

## Verify

```sh
pnpm check
pnpm test
```

Then sign in as a role below the first of a channel it manages and invite someone at the first role: the answer is 403
`role_exceeds_actor`.
