---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: DeleteMemberships, LeaveChannelForm, WithdrawInvitationButton, PublishOrganizationForm, menuItemOrder, widenMotion, getQueryKeySortOrder, usePageChannelKey, AppContent, LegalFieldCell, notifyOptions, BlockTypeItems, SlashMenuList, NodeKey, InlinePrimitiveValue, PrimitiveValue, CollapsedPreview, CopyNodeButton, getImageEditorOptions, storeUploadBlobs, prepareFilesForOffline, generateRestrictionNote, Confetti, SkipOrganization, skipOrganizationDialogId, MfaConfirmation, WarningNote, UserProfileSubline, DeleteSelf, getSlashMenuItems, getBlockTypeItems, isCurrentBlockType, updateBlockWithoutHistory, getDictionary, getValueType, isPathPrefix, GroupedColumnHeaderCell, DataTableSkeleton, reorderPanels, isPanelReorderDragData, getLeftRightKey, isSelectedCellEditable, DropdownerDoneTip, JsonActions, getStatusColor, OperationRequest, sortOperations, ViewModeToggle, DocsSearchRow, LinksSection, PagesSection, isSwitchedOff, useOperationSearch, buildPageNodeTree, computeAncestorIds, useChannelSettingsSections, ChannelSettingsHost, InvitationsStep, getOnboardingSteps, IdentityTile, PasskeyTile, StepUpTier, UnsavedEditsDialog, BottomBarNav, SearchResultBlock, MenuSheetSectionButton, CreateApiKeyForm, createApiKeyDialogId, UserSheet, InviteFormFooter, InviteFieldLine, InviteRoleField, afterFocusLeaves, withPasted, getHotkeyMatcher, shouldFireEvent, StreamState, redirectOnMissing, tearsDownSession, canCoalesce, getMenuParentTypes, isMenuParentOf, getRegisteredChannelTypes, truncateMiddle, cleanFileName, AnimatedArrow
---

# Single-use frontend helpers fold into their consumers

Seventy-nine frontend files whose exports had one consumer are gone, and `AnimatedArrow`, which nothing rendered, is deleted. A helper several files used moved into a sibling
that says its role and is still exported there, so the fix is the import path the compiler names; a helper only one file
used became a local of that file, so an app that imported it copies the function out or renders the component that now
holds it. `DeleteMemberships` takes the `channel` it acts on in place of four id props, and a set of types nothing
outside their file used are no longer exported.

## What & why

A pass over the frontend's line count folded every helper file with one export and one consumer into that consumer and
grouped the helpers of one domain into one file (`menu-rows.ts`, `menu-organizations.ts`, `legal-tables.tsx`,
`invite-fields.tsx`, `uppy-helpers.ts`, `json-node.tsx`). A second pass judged every export with one or two users:
render-only splits folded into their parent, one-use aliases went inline, one-consumer files merged, and exported types
nobody imports lost `export`. Several exported functions are now `const` arrows with the same name and signature.

## Blast radius

Frontend only, no wire shape and no database change, so no `clientCacheVersion` bump. The compiler names every import of
a removed path or export and every `DeleteMemberships` call with the old props. An app that never imported these helpers
and never rendered `DeleteMemberships` is unaffected.

## Run

No script: manual.

## Manual steps

1. Navigation: import `canMove`, `canMute`, `isSubmenuShown`, `sortAndFilterMenu`, `useSubmenuArchivedOpen`, `isMenuItemDragData`, `archivedDropData` and `isArchivedDropData` from `~/modules/navigation/menu-sheet/helpers/menu-rows`, and `organizationSections` and `useRouteOrganizationId` from `~/modules/navigation/menu-sheet/helpers/menu-organizations`; `menuItemOrder` is a local of `use-menu-row-moves.ts`, `MenuSheetSectionButton` and `widenMotion` of `menu-sheet/section.tsx`, `BottomBarNav` of `app-nav.tsx` and `SearchResultBlock` of `app-search.tsx`.
2. Memberships, organization and service accounts: render `DeleteMemberships` with `channel={channel}` (an `EnrichedChannel`) in place of `entityId`, `entityType`, `tenantId` and `organizationId`; `LeaveChannelForm`, `WithdrawInvitationButton` and `PublishOrganizationForm` are locals of `joined-button.tsx`, `pending-memberships-list.tsx` and `organization-page.tsx`; `CreateApiKeyForm`, `CreatedApiKey` and `createApiKeyDialogId` are locals of `service-accounts/api-keys-card.tsx`.
3. Query, lib, hooks and utils: `truncateMiddle` is a local of `common/page/tab-nav-shell.tsx` and `cleanFileName` of `common/uploader/helpers/uppy-helpers.ts`; `getQueryKeySortOrder` and `QueryDataAction` are locals of `query/basic/cache-mutations.ts`, `tearsDownSession` of `query/on-error.ts`, `canCoalesce` of `query/offline/squash-utils.ts`, `getMenuParentTypes`, `isMenuParentOf` and `getRegisteredChannelTypes` of `query/enrichment/init-channel-enrichment.ts`, `StreamState` of `query/realtime/stream-manager.ts`; `redirectOnMissing` is inlined in `resolveChannelBySlug` and `getHotkeyMatcher` at its call; import `shouldFireEvent` from `~/hooks/use-hotkeys` and `mapleEnabled` from `~/lib/otel`; `FrontendModule`, `ToolFor`, `UserProfileContext`, `RangeFetch`, `SpliceResult`, `SyncedListScope`, `KvRecord`, `PersistedMetaRecord`, `YDocStateRecord`, `RangeFetchResult`, `EnqueueInput`, `DateMiniKind`, `ErrorNoticeError`, `TimeZoneEntry` and `ProductLocation` are no longer exported.
4. Common app, dropdowner, alerter, toaster and page: `common/animated-arrow.tsx` is deleted (an app that renders it copies the component from the previous release); `AppContent` and `usePageChannelKey` are locals of `common/app/app-layout.tsx`, `DropdownerDoneTip` of `dropdowner/provider.tsx`; `AppAlert`, `DropdownerSurface`, `DropdownKind`, `OverlayClose`, `NavCandidate`, `SelectionReceipt`, `ToastOptions` and `ToastSeverity` are no longer exported.
5. Attachment: import `DescriptionCell` and `openDescriptionSheetFromCell` from `~/modules/attachment/table/attachment-cells`.
6. Auth, legal and me: import `AuthEmailButton` from `~/modules/auth/auth-header`, and `Subprocessors` and `ProcessedDataTypes` from `~/modules/auth/legal/legal-tables`, where `LegalFieldCell` is a local; `StepUpTier` is inlined on `ensureStepUp`, `UnsavedEditsDialog` is folded into `UnsavedEditsGate` and `useUnsavedEdits` is its local; `DeleteSelf` and `IdentityTile` are locals of `me/account-tools.tsx`, `PasskeyTile` of `me/passkeys-list.tsx`, `MfaConfirmation` of `mfa-switch.tsx`, and `WarningNote` is folded into `totp-setup.tsx`.
7. Blocknote: import `FilePanelBridge` from `~/modules/common/blocknote/custom-file-panel/upload-host`; `notifyOptions` is a local of `notify-block.tsx`, `BlockTypeItems`, `getBlockTypeItems` and `isCurrentBlockType` of `custom-side-menu/side-menu.tsx`, `SlashMenuList`, `getSlashMenuItems`, `customSlashIndexedItems` and `baseBlockNoteTypeToKeys` of `custom-slash-menu/slash-menu.tsx`, `ChecklistItemRender`, `ChecklistItemView`, `newCheckboxId` and `updateBlockWithoutHistory` of `custom-elements/checklist/checklist-item-block.tsx`, `attachmentBlockProps`, `storedFileBlockProps` and `FileBlockProps` of `custom-file-panel/uppy-upload-panel.tsx`, `FileOpenPreviewButton` of `custom-formatting-toolbar/formatting-toolbar.tsx` and `getDictionary` of `blocknote-editor.tsx`; `UploadHostApi`, `EndReason`, `YjsStopReason`, `YjsTransport`, `RemoteSource`, `HttpLinkHandlers`, `batchUpdates` and `YDocWriterOptions` are no longer exported.
8. Json viewer: `NodeKey`, `InlinePrimitiveValue`, `PrimitiveValue`, `CollapsedPreview`, `CopyNodeButton`, `getValueType` and `jsonSchemaTypes` are locals of `json-viewer/json-node.tsx`, `isPathPrefix` of `use-node-expansion.ts`.
9. Data grid, data table, board and panels: `GroupedColumnHeaderCell` is a local of `data-grid/grouped-column-header-row.tsx`, `RenderCheckboxProps` of `cell-renderers/render-checkbox.tsx`, `DataTableSkeleton` of `data-table/data-table.tsx`, `PanelReorderDragData`, `isPanelReorderDragData` and `reorderPanels` of `board/board-layout.tsx`; `getLeftRightKey` and `isSelectedCellEditable` are inlined; `EstimateLinesContext`, `ColumnGroup`, `BaseRenderRowProps`, `SortDirection`, `HeaderRowProps`, `GroupedColumnHeaderRowProps`, `EditStatus`, `RenderExpandToggleProps`, `TreeMutate`, `UseTreeRowsOptions`, `DropZone`, `EndDragState` and `FitInput` are no longer exported, and `RenderSortIconProps`, `RenderSortPriorityProps` and `RenderSortStatusProps` are deleted.
10. Uploader: import `isImageTemplate` from `~/modules/common/uploader/helpers/uppy-helpers`, where `getImageEditorOptions`, `storeUploadBlobs` and `prepareFilesForOffline` are locals; `generateRestrictionNote` is a local of `upload-dashboard.tsx`.
11. Docs: import `extensionLabel` from `~/modules/docs/helpers/extension-value`, `OperationItem` from `~/modules/docs/sidebar/operations-sidebar` and `SchemaItem` from `~/modules/docs/sidebar/schemas-sidebar`; `JsonActions` is a local of `openapi-spec-viewer.tsx`, `getStatusColor` of `operations/operation-responses.tsx`, `OperationRequest` of `operations/operation-detail.tsx`, `sortOperations` of `operations-table.tsx`, `ViewModeToggle` of `operations/operations-bar.tsx`, `DocsSearchRow` of `search/docs-search.tsx`, `LinksSection` and `PagesSection` of `sidebar/docs-sidebar.tsx`, `useOperationSearch` of `sidebar/operations-sidebar.tsx`, `buildPageNodeTree` and `computeAncestorIds` of `sidebar/pages-sidebar.tsx`; `isSwitchedOff` is inlined, `EngineLabels` and `DocsConfig` are no longer exported, `DocsSection` and `DocsSectionId` are deleted.
12. Entities, home and user: `useChannelSettingsSections`, `ChannelSettingsHost` and `ChannelSettingsSection` are locals of `entities/channel-settings-page.tsx`; `Confetti` of `home/onboarding/completed.tsx`, `SkipOrganization` and `skipOrganizationDialogId` of `skip-step-button.tsx`, `InvitationsStep`, `getOnboardingSteps` and `OnboardingContext` of `onboarding.tsx`; import `InviteEmailField`, `InviteSearchField` and `InviteBulkField` from `~/modules/user/invite-fields`, where `InviteFieldLine`, `afterFocusLeaves` and `withPasted` are locals; `InviteRoleField` is a local of `invite-users.tsx` and `InviteFormFooter` is folded into `InviteUsers`; `UserSheet` is a local of `user-sheet-handler.tsx`, `UserProfileSubline` is folded into `user-profile.tsx`, and `InviteView` is no longer exported.
13. Page: import `PagesTableBar` from `~/modules/page/table/pages-table`.

## Verify

```sh
pnpm check
```
