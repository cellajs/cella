---
syncBreaking: true
clientCacheBump: false
---

# Names and paths the consistency sweep held back for the forks

The consistency sweep kept 29 names and paths because the apps import them. They change now in one step: renamed props,
types, functions and files, a removed barrel, two removed re-exports and a removed prop. App-owned files that use an old
name fail `pnpm ts` until they take the new one. Synced files take the new names with the sync.

## What & why

Each old name said something the code does not do: a prop of i18next options called `titleProps`, key presses called
clicks, a hook that calls no hook, a file named after none of its exports, a word the repo reserves for something else.
The sweep left them because renaming broke app files; all apps are preproduction and maintained together, so they go now.

## Blast radius

Frontend only, plus one stored value: the realtime sync cursors' `contexts` field is now `channels`, and the store's
version 1 drops cursors stored before it, so the next catchup re-baselines (the path a fresh install takes). The Yjs tab
messages carry `kind` instead of `t` on a channel with a new name, so a tab still on the old build ignores them until it
reloads. No database or API change.

## Run

No script: manual. Every row is a search and replace in the app's own files.

## Manual steps

1. Rename these where the app's own files use them:

   | Old | New |
   | --- | --- |
   | `ContentPlaceholder` prop `titleProps` | `titleOptions` |
   | `TableSearch` prop `setQuery` | `onSearch` |
   | BlockNote props `onEscapeClick`, `onEnterClick` | `onEscape`, `onCmdEnter` |
   | `blocknoteFieldIsDirty` (`helpers/blocknote-field-is-dirty`) | `blocknoteHasContent` (`helpers/blocknote-has-content`) |
   | `CustomBlockFileTypes`, `excludeFileBlockTypes` | `CustomBlockMediaTypes`, `excludeMediaBlockTypes` |
   | `common/blocknote/helpers/focus` | `common/blocknote/helpers/focus-editor` |
   | `common/blocknote/yjs-editor` | `common/blocknote/yjs-owned-fields` |
   | `useDescriptionUpdate` (`common/blocknote/use-description-update`) | `createDescriptionUpdater` (`common/blocknote/description-updater`) |
   | `ui/totp` | `ui/input-otp` |
   | `Button` variant `outlineGhost` | `outline-ghost` |
   | `LabelDirectionType` | `LabelDirection` |
   | `LegalSection` type (`auth/legal/legal-types`) | `LegalSectionConfig` (the `LegalSection` component keeps its name) |
   | `StepUpDismissed` | `StepUpDismissedError` |
   | `auth/use-post-auth-redirect` | `auth/post-auth-redirect` |
   | `PageCover` prop `coverUpdateCallback` | `onCoverUpdate`, now optional |
   | `TabsArrangementCard` prop `persist` | `onPersist` |
   | `BaseEntityGrid` prop `fetchNextPage` | `fetchMore` |
   | `memberships/leave-channel-button` | `memberships/use-leave-channel` |
   | `syncEntityToCache` | `writeEntityToCache` |
   | `inNumbersArray` (`utils/in-numbers-array`) | `isInRange` (`utils/is-in-range`) |
   | `hooks/use-hot-keys`, `hooks/use-hot-keys-helpers` | `hooks/use-hotkeys`, `hooks/use-hotkeys-helpers` |
   | `hooks/use-scroll-spy-store` | `hooks/scroll-spy-store` |
   | `hooks/use-route-context` | `hooks/use-organization-layout-context` |

2. Import from the match-highlight files instead of the removed `~/modules/common/match-highlight` barrel: `HighlightText` from `match-highlight/highlight-text`, `MatchScope` from `match-highlight/match-scope`, `useMatchHighlight` from `match-highlight/use-match-highlight`, `useMatchSteps` from `match-highlight/use-match-steps`. The two highlight files load the stylesheet themselves.
3. Remove what no longer exists:
   - `slugFetchCacheKey` in `resolveChannelBySlug` configs: the resolver caches a fetched row under the detail query key itself.
   - `limit` in a table's `searchVars`: `BaseTableBarProps.searchVars` is the table's own search type. An export query that needs a page size passes it itself.
   - `ErrorNoticeError` imported from `common/error-notice`: `ErrorNotice` takes `error?: unknown`, so drop the cast.
   - `subscribeOwnerChange` imported from `query/local-user-storage`: import it from `query/local-user-db`.
4. The app files this touched on 2026-10-23:
   - **raak:** `label/` (`label-list`, `label-tile`, `label-tile-details`, `label-description-form`, `query`, `use-label-description-update`, `use-label-usage`, `use-primary-labels`); `project/` (`project-page`, `public-project-page`, `project-settings`, `projects-grid`, `projects-table`, `route-logic`, `suggestions-combobox`, `use-project-membership-actions`, `use-project-publicity`); `task/` (`board-search`, `board/board-empty`, `board/project-actions-menu`, `card/card-content-expanded`, `card/card-description-slot`, `card/card-footer`, `card/summary-html`, `card/task-match-reason`, `card/task-sheet`, `card/task-update-form`, `create-task-form`, `dropdowns/combobox-scaffold`, `dropdowns/select-labels`, `dropdowns/select-members`, `helpers/create-task`, `hooks/use-task-description-update`, `hooks/use-task-query`, `panel/panel-empty`, `table/tasks-columns`, `table/tasks-table`, `task-search-scope`, `tasks-hotkeys`); `workspace/` (`route-logic`, `workspaces-grid`); `board-focus/board-nav-hotkeys`, `common/board/explainer-panel`.
   - **projectcampus:** `course/`, `course-section/` and `project/` (`*-page`, `*-grid`, `*-table`, `route-logic`, `settings-tools`); `item/` (`query`, `card/card-footer`, `feed/aggregated-feed`, `feed/feed-search`, `feed/home-feed`, `feed/item-feed`, `hooks/use-item-hotkeys`); `milestone/` (`submissions-sheet`, `table/submissions-bar`); `comment/` (`comment-composer`, `query`); `common/` (`product-update-form`, `product-author`, `product-document`); `label/` (`combobox-scaffold`, `query`); `material/query`, `profile/profile-content`, `auth/totp-verify-code-form`, and the tests that mock the moved paths (`attachment/tests/description-derivation`, `common/tests/product-update-form`, `common/tests/product-update-ops`). The copies of files cella moved before (`hooks/use-scroll-spy.tsx`, `entities/entity-grid/grid.tsx`, `common/json-viewer/key-renderer.tsx`, `common/blocknote/custom-side-menu/reset-block-type.tsx`, `docs/sidebar/page-tree-item.tsx`, `common/data-table/tests/infinite-tables.test.tsx`) go with the sync.

## Verify

```sh
pnpm ts
pnpm check
```
