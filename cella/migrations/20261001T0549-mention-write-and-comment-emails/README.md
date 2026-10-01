# Mentions read from the body, comment emails, filter-aware list refetch

## What & why

No column stores mentions: the notification fan-out reads them from the row's stored `description` on a create or
a body change, so a mention edit is one CDC activity. `mentionableColumns` is deprecated (empty); `writeMentions`
and `deriveFrom` are gone. With `has.commentEmail` on, `comment` and `reply` rows mail opted-in users.
`registerEqualityFilterKeys` lets a new row skip filtered lists it cannot belong to. `findPendingMentionEmails` is
`findPendingInstantEmails`.

## Blast radius

Not sync-breaking, no cache bump. `pnpm generate` drops `attachments.mentions` and the `mentions` column of each
app table spreading `mentionableColumns`. A source with `mentionable: false` sends no mentions. Comment emails stay
off until an app sets `has.commentEmail`. Backend test runs queue on one advisory lock.

## Run

No script: manual.

## Manual steps

1. Remove `...mentionableColumns` from app tables and run `pnpm generate`: it drops `attachments.mentions` and each such table's `mentions` column (projectcampus: comment, item). Seeds, mocks and tests that set `mentions` put the mention in `description` (projectcampus: `55-notifications.seed.ts`, comment and item mocks).
2. Drop `writeMentions` and `deriveFrom` from `notifications` declarations; a custom `loadRows` returns `description`, which the fan-out reads mentions from.
3. Apps that emit `comment`/`reply` notifications and want them mailed set `has.commentEmail: true`; users opt in with the account switch, and a mention on the same subject wins (projectcampus).
4. Optional: lists filtered on a row column call `registerEqualityFilterKeys('<type>', ['<column>'])` next to `registerEntityQueryKeys` (projectcampus: `registerEqualityFilterKeys('comment', ['itemId'])`).
5. App code calling `findPendingMentionEmails` uses `findPendingInstantEmails`.

## Verify

```sh
pnpm generate
pnpm test:core
pnpm check
```
