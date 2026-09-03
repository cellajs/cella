# Media blocks carry an attachment reference

## What & why

Media blocks (`image`, `video`, `audio`, `file`) gain an `attachmentId` prop through
`withAttachmentRef` (`shared/utils/blocknote-schema-configs`), applied to both schemas that
round-trip a shared Y.Doc: `frontend/src/modules/common/blocknote/blocknote-config.ts` and
`yjs/src/lib/blocknote-seed.ts`. `UppyFilePanel` stamps it on upload alongside `url`, so
references never parse a URL. Also: `checklistGroupConfig` and the
unreferenced `checklist-group-block.tsx` / `checklist-group-render.tsx` are deleted (never
registered in any schema); the four `mediaBlockTypes` copies consolidate onto
`shared/utils/text-from-block` (`shared/blocknote`); new `shared/utils/derive-description-core.ts`
holds the shared block walk (checkbox and media counts, attachment-id collection, summary source).

## Blast radius

Sync-breaking only for apps importing `checklistGroupConfig` / `checklistGroupBlock` /
`getChecklistGroupSlashItem` or keeping their own media block specs. No database or wire-shape
change, no `clientCacheVersion` bump (BlockNote fills the prop with `''` on older content). Silent
failure: extending only one of the two schemas drops the prop on every Y.Doc round-trip.

## Run

No script, manual.

## Manual steps

1. If your app defines its own editor schema, wrap the four media specs in both schemas:
   `audio/file/image/video: withAttachmentRef(defaultBlockSpecs.<type>)` (the yjs relay does the
   same on `defaultBlockSpecs`).
2. If your app stamps uploaded media into blocks outside `UppyFilePanel`, add
   `attachmentId: attachment.id` to the props it writes.
3. Delete local `checklistGroup` wiring (`checklistGroupConfig` import, slash-menu item, schema
   entry); an app that registered the block keeps its own copy of the config.
4. Replace local `new Set(['image', 'video', 'audio', 'file'])` with
   `import { mediaBlockTypes } from 'shared/blocknote'`.
5. Optional: derive descriptions via `countDescriptionBlocks` / `findSummarySource` /
   `blockPlainText` from `shared/utils/derive-description-core`.

## Verify

```sh
pnpm check
pnpm --filter yjs-worker exec vitest run src/tests/blocknote-seed.test.ts   # proves both schemas agree: attachmentId survives blocks -> Y.Doc -> blocks
pnpm --filter shared exec vitest run
```
