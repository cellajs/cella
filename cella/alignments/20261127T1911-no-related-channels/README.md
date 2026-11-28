---
breaking: true
clientCacheBump: false
caughtBy: compiler
---

# The hierarchy has no relatedChannels option

`channel()` and `product()` of `createEntityHierarchy` lose the `relatedChannels` option, and `hierarchy.getRelatedChannels`,
`hierarchy.relatableChannelTypes` and the `RelatedChannelType` export of `shared` go with it. An app that declared
`relatedChannels` declares that column on its own table: a plain nullable `uuid().references(...)` with its index.

## What & why

No app declared `relatedChannels`. On a product it added a nullable `<channel>Id` column through `channelRelationColumns`
and an index through `channelRelationConstraints`; on a channel it added no column, while the index helper still asked
for one. Nothing outside a test read `relatableChannelTypes`. The builder drops `validateRelatedChannels` and one type
parameter of `EntityHierarchyBuilder` and `EntityHierarchy`, and `generateMockEntityChannelIdColumns` mocks ancestor
ids alone.

## Blast radius

An app that never declared `relatedChannels` and never read the removed names has nothing to do. No lens, no cache
bump, and no schema change: an app that declared the option keeps its column by declaring it by hand.

## Run

No script: manual.

## Manual steps

1. For each `relatedChannels` entry of a `product()` in `shared/config/hierarchy-config.ts`, add `<channel>Id: uuid().references(() => <channel table>.id, { onDelete: 'set null' })` to that product's table beside `...channelRelationColumns(...)`, then delete the entry.
2. Add `index('<table>_<channel>_id_index').on(table.<channel>Id)` to the same table's constraint list beside `...channelRelationConstraints(...)`, so the index keeps the name the helper gave it.
3. Delete `relatedChannels` from a `channel()` call: it made no column.
4. Replace a read of `hierarchy.getRelatedChannels(type)`, `hierarchy.relatableChannelTypes` or `RelatedChannelType<E>` with the channel types the app names itself; the typecheck names each site.
5. Set the related id in a seed or test that took it from `generateMockEntityChannelIdColumns`.

## Verify

```sh
pnpm generate   # reports no changes
pnpm check
```
