---
breaking: true
clientCacheBump: false
caughtBy: compiler
---

# An editor's files are its `media` prop

Pass `media={{ organizationId, tenantId, upload: { mediaMode, persist } }}` where an editor took `baseFilePanelProps`:
`onComplete` becomes `upload.persist` and returns its promise. `uploadEditorFile` and `uploadAttachmentFile` are now
`insertFiles` and `uploadAttachmentFiles`, and `attachmentBlockProps(attachment, mediaMode)` is exported from
`custom-file-panel/file-insertion`. The props `filePanel`, `emojis`, `pinTitleBlock` and `onError` are gone.

## What & why

`baseFilePanelProps` also fed file resolution, paste and drop, so an editor without uploads could not show private
files. `media` holds where a document's files live, and `media.upload` turns adding files on. The dialog, paste and
drop now share one upload that takes several files and awaits `persist` before a block names its row. `filePanel`,
`emojis` and `pinTitleBlock` had no caller in the template or its apps.

## Blast radius

Every app that mounts an editor with uploads, or imports the removed helpers: typecheck fails until it follows. No
wire, cache or schema change. An app that only mounts editors without uploads is unaffected.

## Run

No script: manual.

## Manual steps

1. Replace `baseFilePanelProps={{ mediaMode, tenantId, organizationId, onComplete }}` with `media={{ tenantId, organizationId, upload: { mediaMode, persist: onComplete } }}`, also inside `baseBlockNoteProps` of a form field.
2. Move `templateId` into `upload`, beside `mediaMode: 'public-no-attachment'`.
3. Return the promise from `persist`, as in `persist: (attachments) => persistAttachments(attachments, { tenantId, organizationId, placement })`.
4. Give an editor that only shows files `media={{ tenantId, organizationId }}`, without `upload`.
5. Replace `uploadAttachmentFile(file, organizationId)` with `(await uploadAttachmentFiles([file], organizationId))[0]`.
6. Import `attachmentBlockProps` from `~/modules/common/blocknote/custom-file-panel/file-insertion` and drop its `isImage` argument: it also returns `mimeType` and `size`, and no `measuredId`.
7. Delete `pinTitleBlock`, `emojis`, `filePanel` and `onError` where an editor passes them.
8. Rename the type `BaseUppyFilePanelProps` to `EditorMedia`, and write `CustomBlockRegularTypes` as `Exclude<CustomBlockTypes, CustomBlockMediaTypes>`.
9. Add `addFiles` to a test double of `BlockNoteContentApi`.
10. For a form's own "Add files" control, pass the editor a `contentApiRef` and render `<AddFilesButton apiRef={ref} />` from `~/modules/common/blocknote/add-files-button`.

## Verify

```sh
pnpm check
```

Then upload through each editor the app mounts: pick two files in the dialog, paste a screenshot, drop a file. Each
shows in the document, and its attachment row exists once the block names it.
