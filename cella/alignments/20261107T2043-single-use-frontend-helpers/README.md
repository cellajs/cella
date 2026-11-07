---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: DeleteMemberships, LeaveChannelForm, WithdrawInvitationButton, PublishOrganizationForm, menuItemOrder, widenMotion, getQueryKeySortOrder, usePageChannelKey, LegalFieldCell, notifyOptions, BlockTypeItems, SlashMenuList, NodeKey, InlinePrimitiveValue, PrimitiveValue, CollapsedPreview, CopyNodeButton, getImageEditorOptions, storeUploadBlobs, prepareFilesForOffline, generateRestrictionNote, Confetti, SkipOrganization, skipOrganizationDialogId, MfaConfirmation, WarningNote, UserProfileSubline
---

# Single-use frontend helpers fold into their consumers

Forty-six frontend files with one or two exports and one consumer are gone. A helper several files used moved into a
sibling that says its role and is still exported there, so the fix is the import path the compiler names; a helper
only one file used became a local of that file, so an app that imported it copies the function out. `DeleteMemberships`
takes the `channel` it acts on in place of four id props.

## What & why

A pass over the frontend's line count folded every helper file with one export and one consumer into that consumer, and
grouped the helpers of one domain into one file (`menu-rows.ts`, `menu-organizations.ts`, `legal-tables.tsx`,
`invite-fields.tsx`, `uppy-helpers.ts`, `json-node.tsx`). Several exported functions are now `const` arrows with the
same name and signature, which only a caller inside an import cycle at module evaluation can tell apart.

## Blast radius

Frontend only, no wire shape and no database change, so no `clientCacheVersion` bump. The compiler names every import of
a removed path and every `DeleteMemberships` call with the old props. An app that never imported these helpers and never
rendered `DeleteMemberships` is unaffected.

## Run

No script: manual.

## Manual steps

1. Navigation: import `canMove`, `canMute`, `isSubmenuShown`, `sortAndFilterMenu`, `useSubmenuArchivedOpen`, `isMenuItemDragData`, `archivedDropData` and `isArchivedDropData` from `~/modules/navigation/menu-sheet/helpers/menu-rows`, and `organizationSections` and `useRouteOrganizationId` from `~/modules/navigation/menu-sheet/helpers/menu-organizations`; `menuItemOrder` and `widenMotion` are locals of `use-menu-row-moves.ts` and `section-button.tsx`.
2. Memberships and organization: render `DeleteMemberships` with `channel={channel}` (an `EnrichedChannel`) in place of `entityId`, `entityType`, `tenantId` and `organizationId`; `LeaveChannelForm`, `WithdrawInvitationButton` and `PublishOrganizationForm` are locals of `joined-button.tsx`, `pending-memberships-list.tsx` and `organization-page.tsx`.
3. Query: `getQueryKeySortOrder` is a local of `query/basic/cache-mutations.ts`.
4. Lib and hooks: import `mapleEnabled` from `~/lib/otel`; `usePageChannelKey` is a local of `modules/common/app/app-content.tsx`.
5. Attachment: import `DescriptionCell` and `openDescriptionSheetFromCell` from `~/modules/attachment/table/attachment-cells`.
6. Auth and legal: import `AuthEmailButton` from `~/modules/auth/auth-header`, and `Subprocessors` and `ProcessedDataTypes` from `~/modules/auth/legal/legal-tables`, where `LegalFieldCell` is a local.
7. Blocknote: import `FilePanelBridge` from `~/modules/common/blocknote/custom-file-panel/upload-host`; `notifyOptions`, `BlockTypeItems` and `SlashMenuList` are locals of `notify-block.tsx`, `side-menu.tsx` and `slash-menu.tsx`.
8. Json viewer: `NodeKey`, `InlinePrimitiveValue`, `PrimitiveValue`, `CollapsedPreview` and `CopyNodeButton` are locals of `json-viewer/json-node.tsx`.
9. Uploader: import `isImageTemplate` from `~/modules/common/uploader/helpers/uppy-helpers`, where `getImageEditorOptions`, `storeUploadBlobs` and `prepareFilesForOffline` are locals; `generateRestrictionNote` is a local of `upload-dashboard.tsx`.
10. Docs: import `extensionLabel` from `~/modules/docs/helpers/extension-value`, `OperationItem` from `~/modules/docs/sidebar/operations-sidebar` and `SchemaItem` from `~/modules/docs/sidebar/schemas-sidebar`.
11. Home, me and user: `Confetti`, `SkipOrganization`, `skipOrganizationDialogId`, `MfaConfirmation`, `WarningNote` and `UserProfileSubline` are locals of `completed.tsx`, `skip-step-button.tsx`, `mfa-switch.tsx`, `totp-setup.tsx` and `user-profile.tsx`; import `DeleteSelf` from `~/modules/me/account-tools`, and `InviteEmailField`, `InviteSearchField` and `InviteBulkField` from `~/modules/user/invite-fields`.
12. Page: import `PagesTableBar` from `~/modules/page/table/pages-table`.

## Verify

```sh
pnpm check
```
