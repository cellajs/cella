---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: onMutation, MutationPayload, MutationHandler
---

# The mutation bus types its rows by the event's subject

`dispatchMutation(ctx, event, payload)` takes the rows of the event's subject (`'task.updated'` takes task model rows), and an `onMutation` handler receives them typed. Every dispatcher and handler in raak and projectcampus compiles unchanged. raak may drop the four casts in `backend/src/modules/label/label-module.ts`, projectcampus may replace its `UpdatedRows<T>` with the template's `MutationPayload`. The `stx` column is typed `StxStored`.

## What & why

`MutationPayload<E>` holds `before` and `after` as `TrackedModel<SubjectOf<E>>[]`, `MutationHandler<E>` takes it, `BackendModule.onMutation` maps each event to its own handler type, and `dispatchMutation<E>` refuses a row of another table. Handlers read typed rows: the yjs module drops seven guards and a cast, and `YjsWrittenRow` goes. `stxColumns` types `stx` as `StxStored`, `StxBase` plus the optional `changedFields` that `buildStx` writes; the two are assignable both ways and no response schema changes.

## Blast radius

Breaking for a dispatcher whose row lacks a column of the event's model, or is a literal with a key the model lacks, and for a handler typed `MutationHandler` without its event: it gets every tracked row type. raak and projectcampus have neither. No database change, no cache bump.

## Run

No script: manual.

## Manual steps

1. Fix what typecheck flags: pass a dispatcher the rows `.returning()` or the guard's `entity` gives, give a handler its event (`MutationHandler<'task.updated'>`), and pass product rows to `recordYjsOutsideWrite` where code named `YjsWrittenRow`.
2. raak, optional: in `backend/src/modules/label/label-module.ts` drop `row?.setupConfig as { primaryLabels?: PrimaryLabelDefinition[] }` in `primaryLabelsOf` (read `org.setupConfig.primaryLabels`), `rows as unknown as TaskHeatRow[]` in `taskHeatRows` (task rows carry `labels` and `status`), `project.id as string` and `org.id as string`.
3. projectcampus, optional: `UpdatedRows<ItemModel>` in `backend/src/modules/item/item-queries.ts` becomes `Required<MutationPayload<'item.updated'>>`, `UpdatedRows<CommentModel>` in `comment-queries.ts` `Required<MutationPayload<'comment.updated'>>`, and `UpdatedRows<T>` goes.
4. projectcampus: the partial rows `product-cache-store.test.ts` dispatches go with that file (`20261103T1907-product-detail-cache-removed`), the `materialized` flag with `20261103T2124-description-columns-one-registration`.

## Verify

```sh
pnpm check
```
