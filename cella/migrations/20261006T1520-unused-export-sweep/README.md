---
syncBreaking: true
clientCacheBump: false
---

# `pnpm unused` now gates exports, and the template stopped exporting what nothing imports

`pnpm unused` runs `knip --dependencies --include files,exports,nsExports`, so CI fails on an export
nothing imports, not just on an unused file. The template was brought to zero first: 132 exports that
only their own file used lost the `export` keyword, 70 dead re-export lines left the barrels, about 60
symbols with no reader anywhere were deleted, and every export an app does call is marked `@public`,
which knip honours. Your app's own unused exports will fail the gate on the first run after this sync.

## What & why

An export claims an external consumer. When nothing imports it, the next person reading the file has
to work out whether it is API, a leftover or a seam, and in a template that question is expensive
because the answer may live in an app. Two dozen of these turned out to be genuinely misleading: a
second copy-paste implementation beside the grid's own, a public duplicate of a private function in
the same file, a four-helper family whose three dead members had the more obvious names, and a
complete second rendering of the immutability DDL that nothing ran. The gate exists so the pile does
not grow back.

## Blast radius

- **Your unused exports now fail CI.** Run `pnpm unused` before merging the sync and fix what it
  reports: drop the `export` when only that file uses it, delete it when nothing does, or mark it
  `@public` when another workspace or a consumer knip cannot see does use it.
- **Imports of a template symbol that is no longer exported stop compiling.** Each is either
  `@public` here now, or it was deleted; the lists are in step 3.
- No database, schema, cache or API-surface impact: `pnpm sdk` reports the generated SDK unchanged.

## Run

No script: manual.

## Manual steps

1. Sync, then run the gate and read it as a worklist:

   ```sh
   pnpm unused
   ```

2. For each finding in your own modules, pick one:
   - only the declaring file uses it: drop the `export` keyword;
   - nothing uses it: delete it;
   - an app module, another workspace, a migration note or a consumer knip cannot resolve uses it: put
     `@public` in its JSDoc. knip skips `@public` exports with no configuration.
   For the two cases knip cannot see at all, this branch adds two tags in `knip.jsonc`
   (`"tags": ["-testSeam", "-sideEffect"]`): `@testSeam` for an export a test loads through
   `vi.importActual`, and `@sideEffect` for one that exists because constructing it does the work (a
   Pulumi resource, where nothing ever reads the name).
   `knip.jsonc` also lists `frontend/src/modules/ui/chart.tsx` as an entry: the vendored shadcn chart
   is kept whole for an app that wants it, and nothing in cella renders its legend parts yet. Declare
   your own kept-for-later UI the same way rather than tagging each export.
3. If your app imports any of these from the template, it now has to own them. Deleted outright:
   `data-grid/hooks/use-copy-paste.ts` plus `parseTSVToCells`, `getTSVDimensions`, `expandRange`,
   `getCellsInRange`; the unused sidebar, popover, combobox, table, card and breadcrumb sub-parts;
   `immutabilityTriggersSQL`; `federationKeys` (three local copies of it already exist, one per
   caller); `hashPii`; `systemRoleSchema`; `activityTableNames`; `hasAdminDb`;
   `unregisterCacheInvalidation`; `findChangedEntityIds`; `getNotificationSourceTypes`;
   `getSyncCursor`; `useAttachmentActivityFeed`; `subscribeToBreakpointChanges`,
   `getBreakpointSnapshot` (line-for-line copies of the private pair below them);
   `jsonbInt`, `jsonbIncFragment`, `jsonbIncExpr` (only `jsonbIntRaw` was ever used);
   `isRestoreTransition`; `inOrgParamSchema`, `idInOrgParamSchema`,
   `userIdInTenantOrgParamSchema`, `validDomainsSchema`; `insertSideChecklistItem`,
   `insertSideNotifyItem`; `stackOutput`; `primaryStoreOutputs`;
   `generateMockEntityBodyChannelIdColumns`.
4. Three option fields no repo ever set are gone: `StatusEventHandlers.onFileEditorComplete`,
   `StatusEventHandlers.onUploadStart` and `OverlayConfig.additionalSearchParamKeys`. If your app
   passed one, add the field back to your own copy of the type and the one line that reads it.
5. Note for the RLS-scoped param schemas: `inOrgParamSchema` and `idInOrgParamSchema` carried no
   `tenantId` and had no route users, while the tenant-scoped pair has 29 and 23. If you were using
   one, switch to `tenantOrgParamSchema` or `idInTenantOrgParamSchema` rather than re-adding it.

## Known gap this sweep documented rather than fixed

`getSideMenuItems` in `blocknote-schema.ts` spreads only the library's `blockTypeSelectItems(dict)`,
and `customBlockTypeSwitchItems` lists `'checklistItem'`, which no library item can ever match. So the
side menu and the formatting-toolbar block-type dropdown never offer the custom checklist or notify
blocks; only the slash menu does. The two factories written for that seam
(`insertSideChecklistItem`, `insertSideNotifyItem`) had no reader and were deleted. To close the gap,
spread them into `getSideMenuItems` and add `'notify'` to `customBlockTypeSwitchItems`:

```ts
export const getSideMenuItems = (dict: Dictionary) => [...blockTypeSelectItems(dict), insertSideChecklistItem(), insertSideNotifyItem()];
```

## Verify

```sh
pnpm check && pnpm unused && pnpm build
```

`pnpm build` matters here: the service `tsup.config.ts` files import `backend/src/bundle-config.ts`
and no tsconfig covers them, so a typecheck alone would not notice that file going missing.
