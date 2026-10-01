# One write per mention edit, comment emails, filter-aware list refetch

## What & why

A description edit that changes mentions was two updates of one row, so CDC logged two `updated` activities.
`prepareMutation` (mutation bus) returns server-owned columns before the write; the attachment ops write them
in the edit's statement and dispatch with `prepared: true`. With `has.commentEmail` on, `comment` and `reply`
rows mail opted-in users. `registerEqualityFilterKeys` lets a new row skip filtered lists it cannot belong to.
`findPendingMentionEmails` is `findPendingInstantEmails`.

## Blast radius

Not sync-breaking. Apps whose own ops write mentionable products keep two activities per mention edit until
they call `prepareMutation`; the second is now attributed to `mentions`. Comment emails stay off until an app
sets `has.commentEmail`. Backend test runs now queue on one advisory lock. No database change, no cache bump.

## Run

No script: manual.

## Manual steps

1. Ops writing a mentionable product call `prepareMutation(ctx, '<type>.created' | '<type>.updated', { before, after: rowsAboutToBeWritten })`, spread the returned columns into the written values and dispatch with `prepared: true` (see `attachment/operations/update-attachment.ts`; raak: task, projectcampus: comment and item).
2. Apps that emit `comment`/`reply` notifications and want them mailed set `has.commentEmail: true`; users opt in with the account switch, and a mention on the same subject wins (projectcampus).
3. Optional: lists filtered on a row column call `registerEqualityFilterKeys('<type>', ['<column>'])` next to `registerEntityQueryKeys` (projectcampus: `registerEqualityFilterKeys('comment', ['itemId'])`).
4. App code calling `findPendingMentionEmails` uses `findPendingInstantEmails`.

## Verify

```sh
pnpm test:core
pnpm check
```
