---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: LeaveChannelForm, WithdrawInvitationButton, PublishOrganizationForm, DeleteMemberships, canMove, canMute, isArchivedDropData, archivedDropData, isMenuItemDragData, isSubmenuShown, sortAndFilterMenu, useSubmenuArchivedOpen, organizationSections, useRouteOrganizationId, menuItemOrder, widenMotion, getQueryKeySortOrder
---

# Single-use frontend helpers fold into their consumers

Fifteen one-export frontend files are gone: the menu-sheet helpers now live in `menu-sheet/helpers/menu-rows.ts` and
`menu-organizations.ts`, `LeaveChannelForm`, `WithdrawInvitationButton` and `PublishOrganizationForm` are private to the
one component that renders them, and `DeleteMemberships` takes the `channel` it acts on in place of four id props. An
app that imports any of the old paths, or renders `DeleteMemberships`, updates those imports and that call.

## What & why

A pass over the frontend's line count folded every helper file with one export and one consumer into that consumer, and
grouped the menu-sheet helpers by what they decide (`menu-rows.ts`: `canMove`, `canMute`, `isSubmenuShown`,
`sortAndFilterMenu`, `useSubmenuArchivedOpen`, `isMenuItemDragData`, `archivedDropData`, `isArchivedDropData`;
`menu-organizations.ts`: `organizationSections`, `useRouteOrganizationId`). `menuItemOrder`, `widenMotion` and
`getQueryKeySortOrder` became locals. `DeleteMemberships` reads tenant, organization, id and type from one `channel`.

## Blast radius

Frontend only, no wire shape and no database change, so no `clientCacheVersion` bump. The compiler names every import of
a removed path and every `DeleteMemberships` call with the old props. An app that never imported these helpers or
rendered these three components is unaffected.

## Run

No script: manual.

## Manual steps

1. Point imports of `menu-sheet/helpers/can-move`, `can-mute`, `is-submenu-shown`, `sort-and-filter-menu`, `use-submenu-archived-open`, `is-menu-item-drag-data` and `is-archived-drop-data` at `~/modules/navigation/menu-sheet/helpers/menu-rows`.
2. Point imports of `menu-sheet/helpers/organization-sections` and `navigation/use-route-organization-id` at `~/modules/navigation/menu-sheet/helpers/menu-organizations`.
3. An app that imported `LeaveChannelForm`, `WithdrawInvitationButton`, `PublishOrganizationForm`, `menuItemOrder`, `widenMotion` or `getQueryKeySortOrder` copies the function out of `joined-button.tsx`, `pending-memberships-list.tsx`, `organization-page.tsx`, `use-menu-row-moves.ts`, `section-button.tsx` or `cache-mutations.ts` into its own module, or exports it there.
4. Render `DeleteMemberships` with `channel={channel}` (an `EnrichedChannel`) in place of `entityId`, `entityType`, `tenantId` and `organizationId`.

## Verify

```sh
pnpm check
```
