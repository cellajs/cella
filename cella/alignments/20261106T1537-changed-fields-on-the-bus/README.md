---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: changedFields
---

# The fields a write changed travel on the mutation bus, not in the stored stx

A product update dispatches `<type>.updated` with `changedFields: [resolved.acceptedFieldNames]` when `resolved.changed`;
`stripChangedFields` is gone: a write that changes nothing or runs server-side leaves `stx` out of its `set`, and a
soft delete stores its ids through `stxWithIds(<name>sTable.stx, stx)`. `stxStoredSchema` and `StxStored` are gone:
a response declares `stx: stxBaseSchema`, and the stx column is typed `StxBase`.

## What & why

`changedFields` was stored inside each product row's `stx` so the yjs module could tell, in the write's transaction,
whether the write wrote the description; every other write had to strip it. The list now rides on the mutation bus
payload, index-aligned with `after`, and the stored stx holds only the ids and field timestamps. Nothing on the
client read it. The CDC worker computes an activity's changed fields from the row diff, as before.

## Blast radius

Every app product module: its update operation, its queries that set `stx`, its response schema. The stored jsonb
loses an optional key no client reads: no cache bump, no migration. Rows written before the upgrade keep the key until
their next write; nothing reads it.

## Run

No script: manual.

## Manual steps

1. `<name>-schema.ts`: `stx: stxStoredSchema` becomes `stx: stxBaseSchema`.
2. `update-<name>.ts`: `stx: resolved.changed ? resolved.stx : stripChangedFields(<name>sTable.stx)` becomes `...(resolved.changed ? { stx: resolved.stx } : {})`, and the dispatch adds `...(resolved.changed && { changedFields: [resolved.acceptedFieldNames] })`.
3. A `set` with `stx: stripChangedFields(<name>sTable.stx)` alone (a count, a like, a publish, a cleanup) drops the `stx` property.
4. `stx: stripChangedFields(<name>sTable.stx, stx)` or `(…, { mutationId, sourceId })` becomes `stx: stxWithIds(…)` from `#/db/utils/stx-ids`.
5. A test that expects `- 'changedFields'` in a statement, or `changedFields` on a stored stx, drops that expectation.
6. Run `pnpm sdk`.

## Verify

```sh
pnpm check
pnpm --filter backend exec vitest run tests/yjs-outside-write.test.ts
```
