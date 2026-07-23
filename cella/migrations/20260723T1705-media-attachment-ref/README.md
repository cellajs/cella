# Media blocks carry an attachment reference

## What & why

Media blocks (`image`, `video`, `audio`, `file`) gained an `attachmentId` prop, applied through
`withAttachmentRef` from `shared/utils/blocknote-schema-configs` to both schemas that round-trip a
shared Y.Doc: the frontend editor schema in
`frontend/src/modules/common/blocknote/blocknote-config.ts` and the relay's server schema in
`yjs/src/lib/blocknote-seed.ts`. `UppyFilePanel` stamps it on upload alongside the existing `url`
convention, so anything deriving entity references from a description reads an id prop and never
parses a URL.

Two cleanups ride along. `checklistGroupConfig` and its two unreferenced frontend files
(`checklist-group-block.tsx`, `checklist-group-render.tsx`) are deleted: the block was never
registered in any schema. The four independent `mediaBlockTypes` sets are consolidated onto the one
exported from `shared/utils/text-from-block` (`shared/blocknote`). New
`shared/utils/derive-description-core.ts` holds the single block walk (checkbox and media counts,
attachment-id collection, summary-source selection) that a fork's backend and frontend derivation
can share.

## Blast radius

Fork-breaking only for forks that import `checklistGroupConfig` / `checklistGroupBlock` /
`getChecklistGroupSlashItem`, or that keep their own copy of the media block specs. No database
change, no wire-shape change, and no `clientCacheVersion` bump: descriptions stay JSON strings and
BlockNote fills the new prop with its `''` default when reading older content.

The one silent failure mode: a fork that extends only one of the two schemas. The editor schema and
the relay's server schema must carry identical ProseMirror node specs, so `withAttachmentRef` has to
be applied in both places or the prop is dropped on every Y.Doc round-trip.

## Run

No script, manual.

## Manual steps

1. If your fork defines its own editor schema, wrap the four media specs in both schemas:
   `audio/file/image/video: withAttachmentRef(defaultBlockSpecs.<type>)`. The yjs relay uses the
   same helper on `defaultBlockSpecs`.
2. If your fork stamps uploaded media into blocks outside `UppyFilePanel`, add
   `attachmentId: attachment.id` to the props it writes.
3. Delete any local `checklistGroup` wiring (`checklistGroupConfig` import, slash-menu item,
   schema entry). The upstream block had no schema registration; a fork that registered it must
   keep its own copy of the config.
4. Replace local `new Set(['image', 'video', 'audio', 'file'])` definitions with
   `import { mediaBlockTypes } from 'shared/blocknote'`.
5. Optional: point your description derivation at `countDescriptionBlocks` / `findSummarySource` /
   `blockPlainText` from `shared/utils/derive-description-core` so both sides walk blocks
   identically.

## Verify

```sh
pnpm check
pnpm --filter yjs-worker exec vitest run src/tests/blocknote-seed.test.ts
pnpm --filter shared exec vitest run
```

The yjs round-trip test is the gate that proves both schemas agree: it asserts a media block keeps
its `attachmentId` through blocks to Y.Doc and back.
