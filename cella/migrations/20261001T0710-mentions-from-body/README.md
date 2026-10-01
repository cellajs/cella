# Mentions read from the body, one document derivation, comment emails

## What & why

No column stores mentions: the notification fan-out reads them from the stored `description` on a create or a
body change, so a mention edit is one CDC activity. `mentionableColumns` is deprecated and empty; `writeMentions`
and `deriveFrom` are gone. `deriveDocument` derives a description's name, keywords, attachment ids, mentions and
counts in one parse. With `has.commentEmail` on, `comment` and `reply` rows mail opted-in users.
`registerEqualityFilterKeys` lets a new row skip filtered lists it cannot belong to.

## Blast radius

Sync-breaking for apps whose mocks, seeds or bench seeds set `mentions` (raak, projectcampus). Touches the
database: `pnpm generate` drops every `mentions` column. A source with `mentionable: false` sends no mentions.
Comment emails stay off until an app sets `has.commentEmail`. No `clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. Remove `...mentionableColumns` from app tables (raak: `task-db.ts`; projectcampus: `comment-db.ts`, `item-db.ts`) and run `pnpm generate`: it drops `attachments.mentions` and each such table's `mentions` column.
2. Remove `mentions` from mocks and seeds (raak: `task-mocks.ts`, `bench/src/seeds/task.bench.ts` `pgArrayColumns`; projectcampus: `comment-mocks.ts`, `item-mocks.ts`); a seeded mention lives in the body (projectcampus `55-notifications.seed.ts`: put the admin mention in the comment `description`, not `.set({ mentions })`).
3. Drop `writeMentions` and `deriveFrom` from any `notifications` declaration; a custom `loadRows` returns `description`, which the fan-out reads mentions from.
4. Apps emitting `comment`/`reply` notifications that want them mailed set `has.commentEmail: true`; users opt in with the account switch, and a mention on the same subject wins (projectcampus).
5. Optional: lists filtered on a row column call `registerEqualityFilterKeys('<type>', ['<column>'])` next to `registerEntityQueryKeys` (projectcampus: `registerEqualityFilterKeys('comment', ['itemId'])`).
6. Optional: ops deriving several columns from one description read them from one `deriveDocument(description)` (`shared/utils/derive-description-core`): raak task `deriveDescriptionProps` drops its own parse and count branch; projectcampus item and material ops replace `nameFromDocument` + `keywordsFromDocument` pairs.
7. App code calling `findPendingMentionEmails` uses `findPendingInstantEmails`.

## Verify

```sh
pnpm generate
pnpm test:core
pnpm check
```
