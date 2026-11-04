---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: LooseBlock, getSearchableTextFromBlocks, findSummarySource
---

# Stored blocks share one DescriptionBlock type

`DescriptionBlock` lives in `shared/blocknote` (it left `shared/utils/derive-description-core`), and the text walkers,
`parseBlocks` and `findSummarySource` take it in place of BlockNote's `Block`. The frontend's `LooseBlock` in
`common/blocknote/helpers/title-document.ts` is gone: projectcampus's own `promoteTitle` in that file annotates it and
writes `DescriptionBlock` after the merge. raak may drop `as unknown as Block[]` and its `Block` import in
`backend/src/modules/task/helpers/description.ts`, and parse with `parseBlocks` in
`frontend/src/modules/task/helpers/search-filter.ts`.

## What & why

The walkers took `@blocknote/core`'s default `Block` yet read props and inline items as unknown, and the stored block
shape was declared four ways, so every crossing cast. `DescriptionBlock` types `content` as inline items or a table's
rows of cells, which BlockNote's `Block` and the editor's `CustomBlock` both assign to. `extractKeywordsFromBlocks`
parses through `parseBlocks`: a malformed body adds no keywords where it threw.

## Blast radius

An app that never edited the blocknote helpers has nothing to do: a `Block[]` still passes to every walker. An app copy
of `title-document.ts` that names `LooseBlock` fails to compile. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. projectcampus `frontend/src/modules/common/blocknote/helpers/title-document.ts`: keep `promoteTitle` through the merge and annotate it with `DescriptionBlock`, imported from `shared/blocknote` beside the file's other imports, where it names `LooseBlock`.
2. Optional, raak `backend/src/modules/task/helpers/description.ts`: pass `blocks` to `getSearchableTextFromBlocks` as they are, and drop the `Block` import and the comment about the cast.
3. Optional, raak `frontend/src/modules/task/helpers/search-filter.ts`: `getSearchableTextFromBlocks(parseBlocks(document) ?? [])` in place of `JSON.parse(document) as Block[]`, without the `Block` import.
4. An app import of `DescriptionBlock` from `shared/utils/derive-description-core` imports it from `shared/blocknote`.

## Verify

```sh
pnpm check
```
