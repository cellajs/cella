---
syncBreaking: true
clientCacheBump: false
---

# Product placement follows the hierarchy, and the template's tests state the config they assume

The pinned `attachment-placement.ts` keeps `seedAttachmentPlacements` alone: create fields and home resolution come
from `#/permissions/product-placement` for every product, and `buildCollectionReadWhere` takes the product type where
it took a column. A bench
attachment's home is the new app-owned `bench/src/seeds/attachment-home.ts`. `generateUniqueSlugs` is back,
`mergeServerResponse` takes `derivedKeys`, mock enforcers reset themselves, and the route sweep refuses a route that
names another user without `relatableGuard` or answers a member with a 5xx.

## What & why

The attachment list compared its home grants with the organization column when every ancestor was nullable, so a
member of a project read nothing, and its `channelId` meant "home" where the sync engine sends a subtree.
`placementFieldsSchema`, `validatePlacement` and `resolvePlacement` derive placement from the hierarchy for any
product; `buildSubtreeCoverWhere` counts the organization as a covering channel. Template tests that read
`appConfig.surfaces`, a feature flag or the member policy now set the value they need.

## Blast radius

Sync-breaking for an app with a customized `attachment-placement.ts`, a bench run, or its own product modules. An
attachment list answers an empty page for an unknown `channelId`, where it answered 404. No database change, no
`clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. `backend/src/modules/attachment/attachment-placement.ts` (pinned): keep `AttachmentSeedPlacement` and `seedAttachmentPlacements`, type the placement as `ResolvedPlacement<'attachment'>` from `#/permissions/product-placement`, delete the rest. A placement rule an app added there beyond the hierarchy (a required channel, a readable home) becomes a `// fork:` edit that passes `requireChannel` or `resolveHome` in `attachment-schema.ts` and `create-attachments.ts`.
2. Create `bench/src/seeds/attachment-home.ts` from the template's copy and name it under `pinned` in `cella/cella.config.ts`. An app whose attachments live in a channel returns that channel per row, such as `{ projectId: projectId(index % TOTAL_PROJECTS) }`, and sets `attachmentSeedOrder` past that channel's seed; then take the template's `attachment.bench.ts` and `processors/attachment-churn.ts`.
3. A product module with hand-written placement: spread `placementFieldsSchema('<name>')` into the create-item schema, check items with `validatePlacement('<name>', item)` (`requireChannel: true` refuses a row in the organization), and stamp `(await resolvePlacement(ctx, '<name>', item)).columns`. `resolveHome` swaps the lookup, the returned `home` carries the channel for rules of the product's own.
4. A product list: `buildCollectionReadWhere(readFilter, <name>sTable, '<name>', actor)`. Its third argument is the product type, from which it takes the home column; `homeChannelColumn` is gone from `#/modules/seen/operations/mark-seen`.
5. A product list with a `channelId` filter: `buildSubtreeCoverWhere` now matches the organization id too. A list that passed the organization's id got an empty page and now gets every row of it; an unknown id matches no row. A members table of a channel below the organization counts 0 for a product that lives in the organization alone, where it counted the member's rows in the whole organization.
6. An app's own `generateUniqueSlug`: call `generateUniqueSlugs(ctx, names, '<type>')` from `#/modules/entities/operations/generate-unique-slugs` and delete the copy. Imports of `#/utils/slug-from-email` point at `#/utils/slug`.
7. An update `onSuccess` that adds server-stamped keys to `mutatedKeys` by hand: pass them as `derivedKeys: { <opKey>: [<stamped keys>] }` to `mergeServerResponse`.
8. A mock with `new UniqueEnforcer()`: use `mockUniqueEnforcer()` from `#/mocks`. `resetUserMockEnforcers` and `resetOrganizationMockEnforcers` are gone; `clearDatabase` resets every enforcer.
9. A test that imports `assumeMemberAttachmentPolicy` from `backend/tests/security/helpers`: import it from `shared/testing/member-policy`. A test that lists a surface: `assumeNoSurfaces()` and `withSurface(slot, ids, run)` from `shared/testing/surfaces`.
10. Take the template's copy of every test file an app edited for its own hierarchy, surfaces or policy: the CDC and Yjs integration suites, `entities-listeners.test.ts`, `placements.test.ts`, `tab-nav.test.tsx` and `account-notifications-card.stories.tsx`.
11. Run `pnpm test:core`. `route-guards.test.ts` now fails for a route with a `relatableUserId` parameter and no `relatableGuard`, and for a route that answers a signed-in member with a 5xx (a product read behind `tenantGuard` without `orgGuard` does): fix the route.
12. A tabbed layout route whose children declare `navTab`: declare `staticData.tabsSlot`. `assertSurfaces()` throws for it at startup outside production.
13. Owed since 0.13, when a table row's menu became `kind: 'menu'`: a row action in a `TableEllipsis` menu that asks for confirmation calls `openPopConfirm(title, children)`. An `update({ content: <PopConfirm> })` from a menu item closes with the menu.
14. Optional: `TableBarShell` takes `controls` for a view toggle or another control of the page's own; an update mutation's `onError` returns early when the row left the cache, as `frontend/src/modules/attachment/query.ts` does.

## Verify

```sh
pnpm check
pnpm test:core
pnpm unused
```
