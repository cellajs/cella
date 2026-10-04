---
syncBreaking: true
clientCacheBump: false
---

# Description sync: one save mode, a stamp guard, one derivation, one slot lifecycle

With Yjs on, a description saves through the relay only: no REST fallback, and the static with a
status (connecting, offline, view only, stopped) until the editor syncs; deploy the relay and the
frontend together. The suppression registry (registerActiveYjsEditor, isYjsEditorActive,
useYjsSseSuppression) is removed: the cache keeps a Yjs-owned field unless the incoming
stx.fieldTimestamps stamp changed. derive-description-props.ts is deleted; deriveDocument returns
summary (block JSON) and summaryLength, and registerDescriptionDerivation runs in every
collaborative cache patch. useYjsConnection takes the organization id and BlockNoteContentApi gains
commit(). raak rebuilds its card description slot on useDescriptionSlot and DescriptionLayers,
stores summary as block JSON (backfill and a clientCacheVersion bump); projectcampus rebuilds its
item and material documents on the hook and registers its name derivation.

## What & why

With Yjs on, a description saves through the relay only: no REST fallback, and a static with a status until the editor syncs. The cache takes a Yjs-owned field only from a server write (`stx.fieldTimestamps`), which replaces the suppression registry. `deriveDocument` adds `summary` (block JSON) and `summaryLength`, and `registerDescriptionDerivation` patches derived columns on every collaborative commit. `useDescriptionSlot` and `<DescriptionLayers>` replace the apps' own static ↔ warm ↔ edit copies. The relay sends `Saved` (type 5).

## Blast radius

Sync-breaking for apps with an in-place description slot or `derive-description-props.ts` imports (raak, projectcampus). Deploy the relay and the frontend together. raak's `summary` changes format: backfill it and bump `clientCacheVersion`. Database: raak's backfill only. Apps using only cella's attachment sheet change nothing.

## Run

No script: manual.

## Manual steps

1. Remove uses of `registerActiveYjsEditor`, `unregisterActiveYjsEditor`, `isYjsEditorActive` and `useYjsSseSuppression` (gone), and `entityType`/`entityId` from any `CollaborationBundle` you build.
2. `useYjsConnection(editSessionId, entityType, tenantId, organizationId)` takes the organization id.
3. With Yjs on, drop app code that relies on the solo fallback: `SYNC_TIMEOUT_MS`, the `error:sync_failed` toast, and REST halves of `updateData` reached with `collaborative = false` (editor hosts now always pass `true`).
4. `waitingFallback` is also the read-only view: don't fade it for viewers. `waitingFallback={null}` renders no static (a warm or hidden editor).
5. Replace imports from the deleted `derive-description-props.ts` (`deriveDescriptionProps`, `deriveDescriptionCounts`) with `deriveDocument` (`shared/utils/derive-description-core`), which now returns `summary` and `summaryLength`.
6. Next to `registerEntityQueryKeys`, register each described type's derivation with `registerDescriptionDerivation('<type>', (d) => ({ … }))`, and its derived columns with `registerYjsOwnedFields('<type>', ['description', …])`. Then stop passing those fields through `extra`.
7. raak: the task ops store `deriveDocument(d).summary` and `.summaryLength`. Register summary, summaryLength, keywords and counts for `task`. Render the summary with `BlockNoteFullHtml` (`inline` keeps what follows it on the text's line). Backfill `tasks.summary` from `description` in a hand-written SQL migration that mirrors `findSummarySource`, checked against `deriveDocument`: a deploy runs SQL migrations only, as the table's owner with RLS not forced, so the statement reads every row. Bump `clientCacheVersion`.
8. projectcampus: register `name` as `deriveDocument(d).name.slice(0, 255).trim()`, and leave it out when empty.
9. Fakes or wrappers of `BlockNoteContentApi` add `commit()`. `onEditorReady` fires once per editor instance; `BlockNoteFullHtml.onReady` also fires for an empty description.
10. raak `task/card/card-description-slot.tsx`: rebuild it on `useDescriptionSlot({ editing, canEdit: !isReadOnly, description, holdOnExit: state === 'expanded', cursorAtPoint: state === 'expanded' })` and `<DescriptionLayers>`. Hover calls `warm('hover')`/`cool('hover')`. Delete `task/card/preserve-description-height.tsx` and the outer wrapper in task-card.tsx.
11. projectcampus `item/item-document.tsx`, `material/material-document.tsx`: rebuild them on the hook. The kebab's warm event becomes `warm('menu')`, with `cool('menu')` in the dropdowner's `onClose`. Drop the inner `PreserveDescriptionHeight` and render the title error as a sibling. Remove `[data-sonner-toaster]` from the outside-press allowlist.
12. Checkbox clicks on the static now commit through the editor: a cache patch with the derivation, or one REST write with Yjs off.
13. A slot-hosted editor takes no `autoFocus`. It focuses the start after the slot placed the cursor; the slot focuses the editor itself.
14. `deriveDocument(d).keywords` holds at most 900 characters. An app whose search matches on a longer keyword column keeps deriving that column in its update operation and leaves `keywords` out of its `registerDescriptionDerivation`.

## Verify

```sh
pnpm sdk
pnpm test:core
pnpm check
```
