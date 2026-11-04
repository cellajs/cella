---
breaking: true
clientCacheBump: false
caughtBy: compiler
---

# One Yjs document key in shared, a product type in the token, and the materialize op takes its parsed body

`YjsDocKey` and `YjsDocScope` are declared once in `shared`, with `entityType` a `ProductEntityType`; the backend's
`yjs-log.ts` and the frontend's `local-user-db.ts` no longer export them. The Yjs token, `LogNotice` and the
`entity_type` columns of `yjs_documents` and `yjs_updates` carry a product type. `materializeDescriptionOp` takes
`YjsMaterializeBody` and `MaterializeDescriptionInput` is gone, so a call that builds the body by hand passes
`serverRowIds`. projectcampus: `backend/tests/derived-attachments.test.ts`.

## What & why

One document key was declared twice, its entity type a string on the backend and the relay, so the token signer
re-declared its payload and the relay and `findEntityDescription` re-checked `isProduct`. The token schema parses
`z.enum(appConfig.productEntityTypes)`, `decodeLogNotice` refuses a notice of another type, and a drizzle enum
narrows both varchar columns. The materialize op takes the body its route parses, and the relay builds that body
`satisfies YjsMaterializeRequest`.

## Blast radius

App code that calls `materializeDescriptionOp` without `serverRowIds`, or imports the two key types from their old
paths, fails to compile. No migration, lens or `clientCacheVersion` bump. A token naming a product type the app
dropped closes with 4001 (malformed) where it got 4003 (denied).

## Run

No script: manual.

## Manual steps

1. Import `YjsDocKey` and `YjsDocScope` from `shared` in place of `#/modules/yjs/helpers/yjs-log` or `~/query/local-user-db`.
2. Add `serverRowIds: []` to each direct `materializeDescriptionOp` call that omits it (projectcampus `backend/tests/derived-attachments.test.ts`).
3. A test fixture that builds a document key, a log notice or a Yjs token with a type outside `appConfig.productEntityTypes` uses a product type.

## Verify

```sh
pnpm generate
pnpm check
```
