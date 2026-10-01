# Title documents: templated, not enforced

## What & why

The BlockNote wrapper no longer enforces a title block: `forcedTitle`, `forcedTitleExtension` and the
`titleLevel` menu filters are removed, since no template surface used them. Titled documents are a template:
seed block 0 with `emptyTitleDocument(level)` and label it with `titlePlaceholder`, which only an empty heading
in block 0 shows. `helpers/forced-title` is renamed `helpers/title-document`, and `titleFromBlocks` is replaced by
`titleFromDocument` in `shared/blocknote`, which the backend's `nameFromDocument` uses too, so both sides read
the same title: block 0's own text, without its children or a media file name, styled runs joined without a
space. `splitTitleBlocks` keeps a non-text block 0 in the body, and `nameFromDocument` clamps to 255 characters.

## Blast radius

Frontend. Sync-breaking only for an app that passes `forcedTitle`, imports `helpers/forced-title` or
`titleFromBlocks`, or re-adds a non-text block 0 to `splitTitleBlocks(...).body`; apps that never used them are
unaffected. No `clientCacheVersion` bump, no lens, no database change.

## Run

No script: manual.

## Manual steps

1. `rg "helpers/forced-title" frontend/src`: import from `~/modules/common/blocknote/helpers/title-document`.
2. `rg "forcedTitle|placeholders=\{\{ title" frontend/src`: replace `forcedTitle={{ level: N }}` with `titlePlaceholder={t('c:title')}`.
   `rg "titleFromBlocks" frontend/src`: import `titleFromDocument` from `shared/blocknote` instead (same signature).
3. Set `headingLevels` to the levels greater than N, the only ones `forcedTitle` left the body: `[]` for a level-3 title under the default `[1, 2, 3]`. Adding N lets body headings look like the title, and lets a title turned into a paragraph be turned back from the block menu.
4. Keep "required" in the form: gate submit on `titleFromDocument(document)` being non-empty.
5. Drop call-site code that re-adds a non-text block 0 to `splitTitleBlocks(...).body`: the helper keeps it now, so it would render twice.
6. An app that must keep block 0 a heading copies the removed `forced-title-extension.ts` from git history into the app and passes it through the editor's `extensions` prop.

## Verify

```sh
rg "forcedTitle|forced-title|titleLevel|titleFromBlocks" frontend/src
pnpm check
```
