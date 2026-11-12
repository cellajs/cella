---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: bn-file-name-with-icon, FileCaptionButton, FileDownloadButton, data-state="editing", is-focused, contentType:, no-such-block, pastedTextMaxLines
---

# File blocks are drawn by the app, and know their file

Check an app's own code against five changes in how files sit in a document: the app draws the image, video, audio
and file blocks itself, a block carries its file's `mimeType`, `size` and `excerpt`, long pasted text becomes a file,
`blocknote/styles.css` no longer lifts list items, and a description the server cannot convert no longer opens.

## What & why

BlockNote's own file blocks had no room for a file's kind, size, upload state or actions. The four blocks are now
React block specs in `custom-elements/media/`, with the same node names. Caption and download left the selection
toolbar for a menu on the file. `attachmentIdOf` takes UUIDs only. A list rule for one app's board left the template
stylesheet. An unconvertible description used to open empty, and the next save replaced it.

## Blast radius

Apps with their own editor CSS, hand-built media blocks, a board that relied on the list rule, or tests of the old
seed. No wire, cache or schema change: the new props default to empty. Deploy the backend and the relay before
clients, as for any new block prop.

## Run

No script: manual.

## Manual steps

1. Move `li:has([data-state="editing"]), li:has(.is-focused) { z-index: 10; }` into the app's own stylesheet when a list of editors needs it: it left `blocknote/styles.css`.
2. Restyle what targeted `.bn-file-name-with-icon`: a file is `.bn-file-row`, with its actions in `.bn-file-actions`.
3. Add `mimeType` and `size` to the props of a media block the app builds by hand, and `excerpt` for a text file.
4. Never name a block prop `contentType`: BlockNote writes props as `data-` attributes, and `data-content-type` is the block's type.
5. Drop an `isUuid` filter on `deriveDocument().attachments`: it holds UUIDs only.
6. Pass `pastedTextMaxLines` to an editor whose limit differs from 40 lines, `Number.POSITIVE_INFINITY` to keep long text as text. Pasted JSON always becomes a file.
7. Rewrite a test that expected an unconvertible description to seed an empty document: the relay closes the socket with 4400 and the pull answers 400 `invalid_request`.

## Verify

```sh
pnpm check
```

Then, in each editor the app mounts: hover a file and open its menu, paste 60 lines of plain text and embed the file
again, and open a document with files read-only. On a board, open a card's editor and check its menus are not clipped.
