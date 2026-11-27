---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: persistAttachments, mockAttachment, insertAttachmentIn
generate: true
---

# An attachment can be a draft, and a host with drafts publishes its files

Run `pnpm generate` for the new `attachments.published_at` column. An app whose host products have drafts and embed attachments passes `draft: true` to `persistAttachments` for an upload into a document that is not published, and calls `publishDraftAttachments` with the host's attachment ids in each write that publishes the host. A full attachment row the app builds by hand takes `publishedAt`.

## What & why

`attachments.publishedAt` puts files under the draft rule that product drafts follow: a draft file stays out of lists, sync and counts, and `getAttachment` and the presign routes refuse it to anyone but its uploader. An upload homed in a channel was readable by the channel's readers at once, so the files of a draft post, or of one still being written, reached readers who could not see the post.

## Blast radius

Every app gets the column; existing rows read as published at the migration's moment, so an app that tracks attachments for unseen badges or member stats sees them once as new. An app without draft hosts needs nothing more. No lens and no `clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. `pnpm generate`: it adds `published_at` with `DEFAULT now()` and regenerates the side effects, which publish `attachments` to CDC behind `published_at IS NOT NULL` and number a file at its publish.
2. Each editor of a host with drafts passes `draft: true` to `persistAttachments` while its document is a draft or not created yet.
3. Each write that publishes such a host, including a create that is published at once, calls `publishDraftAttachments` with the host's attachment ids inside its transaction and dispatches `attachment.updated` with what it returns.
4. A test that inserts attachments with an old `createdAt` and expects them to be recent also sets `publishedAt`.

## Verify

```sh
pnpm generate
pnpm check
```

As a reader of the channel, list the files and request a signed URL while another member writes a draft post with a file: neither shows the file until the post is published.
