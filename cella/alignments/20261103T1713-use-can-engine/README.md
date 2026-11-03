---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: resolveCan, isUnconditionalCan, computeCan, useResolveCan, .can?., memberCan, .membership?., CanHome, CanState, EntityCanMap, enrichWithMembership, enrichWithPermissions, enrichWithInvitation, .invited, requireEntityAction, useChangeEntityRoleMutation
---

# Controls ask the engine through `useCan`; cached rows carry no `membership`, `can`, `memberCan` or `invited`

A control asks `useCan()` from `~/modules/entities/use-can`: `can(action, entityType, row)` runs `checkAccess` on the row itself, or on a new `entityType` row homed at the channel `row` is. `useCan({ asMember: true })` replaces `memberCan`. A channel's membership comes from `findMembership(myMemberships.items, channel.id)` over `meKeys.memberships`, an invitation from `meKeys.invites`. `requireEntityAction(channel, entityType, action, redirectTo)` drops its `channelType` argument.

## What & why

`computeCan`, the six-valued `CanState`, `resolveCan`, `isUnconditionalCan`, `CanHome`, `useResolveCan` and `enrichWithPermissions` were a second engine on the frontend, kept equal by a parity test that had already caught a divergence that shipped. `enrichWithMembership` kept a row's membership after it left `meKeys.memberships`, so a revoked grant kept granting until the row was refetched. Enrichment now writes only `ancestorSlugs`. Menu items still carry `membership`: the menu joins each row with it when it builds.

## Blast radius

Every app control that read `row.can`, `memberCan`, a cached row's `membership` or `invited`, or called the removed helpers. No wire, lens, schema or `clientCacheVersion` change. For a signed-in user `can` denies until the memberships load, as a row without a `can` map did. Without a session it asks as anonymous and fetches nothing, so a public page gets public read only.

## Run

No script: manual. The rewrite is mechanical for a component that held `useResolveCan`, but half the sites are plain helpers or `isUnconditionalCan` calls that need a hook in their component first.

## Manual steps

1. In a component, replace `const resolveCan = useResolveCan()` with `const can = useCan()`, and `resolveCan(X.can?.<type>?.<action>, X.createdBy)` with `can('<action>', '<type>', X)`; `X.can?.[X.entityType]?.<action>` becomes `can('<action>', X.entityType, X)`. A product row checked against its channel's map, `resolveCan(channel.can?.<product>?.<action>, row.createdBy, home)`, becomes `can('<action>', '<product>', row)`.
2. Replace `isUnconditionalCan(channel.can?.<type>?.<action>)` with `can('<action>', '<type>', channel)` in a component that calls `useCan()`: for a product or child channel type it asks about a new row homed at the channel, no creator, so an `'own'` cell denies as before.
3. Replace `channel.memberCan` reads with `useCan({ asMember: true })`. A helper that took a channel with `can` or `memberCan` (`canPostItems`, `canModerateItems`, `itemRowRights`, `itemCardRights`, `canManageMaterials`, `canEditMaterials`) takes the `can` function, or becomes a hook. `homedHere` goes: a question about rows placed at the channel is `can(action, product, channel)`.
4. A bare-role question (`itemModeratorRoles`: `computeCan` on `{ channelType, role }`) reads the policy matrix: `getPolicyPermissions(getEntityPolicies(policyMatrix, '<product>'), channelType, role)?.<action> === 1`.
5. A single-membership question (`readsProductHomedAt`) asks the engine with all memberships: `can('read', productType, channel)`. Where one binding is meant, take `canSubject` and `userAccess` from `~/modules/entities/use-can`: `const subject = canSubject(productType, channel)`, then `!!subject && checkAccess(userAccess(user, false, [membership]), 'read', subject).allowed`.
6. Replace a cached channel row's `.membership` with `findMembership(myMemberships?.items ?? [], row.id)` (`useQuery(myMembershipsQueryOptions())` in a component, `getCachedMemberships()` outside), and `.invited` with a lookup in `meKeys.invites`. A member row's `membership` is the server's and a menu item's is joined when the menu builds: both stay, and the `.membership?.` grep lists them too. A table that edited `row.membership.role` carries the picked role on its own row type, as `OrganizationRow` does.
7. `useChangeEntityRoleMutation` answers the membership and reads the caller's membership itself; pass `{ entity, role }`.
8. `requireEntityAction(context.x, '<type>', '<type>', 'update', to)` becomes `requireEntityAction(context.x, '<type>', 'update', to)`.
9. Tests that built a can map (`computeCan`, `enrichWithMembership`, `enrichWithPermissions`) seed `meKeys.memberships` and call the helper or `checkAccess`. A parity case of `compute-can.test.ts` an app copied becomes an engine expectation.

App files from the review: raak `project/project-page.tsx`, `project/table/projects-columns.tsx`, `project/table/projects-bar.tsx`, `project/public-project-indicators.tsx`, `label/label-description-form.tsx`, `task/card/task-update-form.tsx`, and the `.membership` readers in `workspace/` (`open-in-workspace-item.tsx`, `project-archived-banner.tsx`, `use-restore-project.ts`, `workspace-tile.tsx`, `workspace-arrival-balloon.tsx`, `header/action-buttons.tsx`), `project/` (`use-read-only.ts`, `move-project-form.tsx`, `project-suggestion-combobox.tsx`) and `task/` (`board/task-board-store.ts`, `board/board-hooks.ts`, `board/project-actions-menu.tsx`, `board/workspace-board-skeleton.tsx`, `helpers/board-helpers.ts`). projectcampus `item/helpers/item-moderation.ts`, `material/helpers/material-rights.ts`, `channel-tile/{use-reads-product.ts,can-post-items.ts,channel-about-panel.tsx,channel-about-row.tsx,channel-table-columns.tsx,channels-table-bar.tsx,channel-membership-button.tsx}`, `course/{course-page.tsx,route-components.tsx,table/courses-columns.tsx,table/courses-table.tsx}`, `course-section/{course-section-page.tsx,route-components.tsx,table/course-sections-columns.tsx,table/course-sections-table.tsx}`, `project/{project-page.tsx,route-components.tsx,table/projects-columns.tsx,table/projects-table.tsx}`, `milestone/{milestone-box.tsx,helpers/participation.ts}`, `item/hooks/use-feed-filters.ts`, the three `settings.tsx` routes, and the tests `item/tests/{item-moderation,item-row-rights}.test.ts`, `material/tests/material-rights.test.ts`, `channel-tile/{can-post-items,channel-settings-gate}.test.ts`, `milestone/tests/milestone-bar-host.test.tsx`.

## Verify

```sh
pnpm --filter frontend exec vitest run src/modules src/routes
pnpm check
```
