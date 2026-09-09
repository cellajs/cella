# Seed description builder, sheet static preview, shared description-update halves

## What & why

Three BlockNote alignments from cella#1146. `backend/scripts/seeds/description-document.ts` is the
one seed builder (`paragraphBlock`, `textDocument`, `mentionDocument`) with every default prop in
BlockNote's own key order, so seeded documents survive the relay seed and the editor's on-load
comparison unchanged; the attachment and notifications seeds use it. The attachment description
sheet renders a faded `BlockNoteFullHtml` as `waitingFallback`. `use-description-update.ts` exports
`patchCollaborativeDescription` and `persistStandaloneDescription` for app editors to compose.

## Blast radius

Not sync-breaking; no wire, cache or database change. Only apps with their own seed block builders,
description-editor hosts, or description-update hooks have work. An app that never seeds
descriptions and edits none of its products through `CollaborativeBlockNote` is unaffected.

## Run

No script: manual.

## Manual steps

1. `20-attachment.seed.ts` conflicts on sync: cella#1146 rewrote it around `seed-assets.json`; take cella's version, then re-apply your placement seam if you customized it.
2. Delete local block builders and import from `./description-document` instead: raak `createDescription` in `15-tasks.seed.ts` (keep the checklist loop, wrap items with `paragraphBlock`-style explicit props: `{ textColor, textAlignment, checkboxId, checked }` in that key order), both apps `mentionDocument` in `55-notifications.seed.ts`.
3. Optional, editors hosting `CollaborativeBlockNote` that still pass a spinner or nothing as `waitingFallback`: render the stored description through `BlockNoteFullHtml` inside `pointer-events-none select-none opacity-50` with the editor's min height, as `attachment-description-sheet.tsx` does.
4. raak `use-task-description-update.ts`: return `collaborative ? patchCollaborativeDescription('task', task, description, derived) : persistStandaloneDescription('task', task, description, (ops) => updateDesc({ id: task.id, ops, summary, summaryLength }))`, computing `deriveDescriptionProps` once before the branch; keep `triggerTaskGlow` after the collaborative patch.
5. projectcampus `use-item-description-update.ts`: mirror `use-material-description-update.ts`, which already composes the two halves (`name` via `titleFromBlocks` in the collaborative extra, the 900 ms solo debounce around `persistStandaloneDescription`).

## Verify

```sh
pnpm --filter backend seed   # against an empty database: seeded rows open in the editor without a write on load
pnpm check
```
