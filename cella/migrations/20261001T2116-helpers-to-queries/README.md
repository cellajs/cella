# Database helpers move into query files

## What & why

`insertUsers`, `insertActors`, `deleteDanglingActors` and `insertServiceAccount` move to `user-queries.ts`, `actors-queries.ts` and `service-accounts-queries.ts` and take `(ctx, opts)`. `issueApiKey`, `managed-service-account.ts` and the unused `generateUniqueSlug` are gone. Notification reads leave `helpers/` (`accessForUserIds` becomes `getUserAccess`), `digest/` folds into `operations/`, and every notification query takes `(ctx, opts)`. The reason: `helpers/` holds database-free code only; reads and writes are queries.

## Blast radius

Apps whose seeds, tests, bench seeds or modules call these functions; TypeScript reports each call. No database change, no `clientCacheVersion` bump. An app that never calls them is unaffected.

## Run

No script: manual.

## Manual steps

1. `insertUsers(db, records, opts)` becomes `insertUsers({ var: { db } }, { users: records, ...opts })` from `#/modules/user/user-queries`.
2. `insertActors(tx, ids, kind, opts)` becomes `insertActors({ var: { db: tx } }, { ids, kind, ...opts })` from `#/modules/actors/actors-queries`; `deleteDanglingActors` takes `{ ids }`.
3. `insertServiceAccount(tx, record)` becomes `insertServiceAccount({ var: { db: tx } }, { values: record })` from `service-accounts-queries`.
4. `issueApiKey(tx, input)` becomes `generateApiKey('secret')` plus `insertApiKey(ctx, { values: { ...input, ...parsed } })`; return the plaintext `key` yourself.
5. `requireOrgAdmin` / `requireManagedServiceAccount` become `getValidChannel(ctx, organizationId, 'organization', 'update')`, then `findServiceAccountInTenant` and a 404.
6. Notification queries take a context: outside a request pass `{ var: { db: baseDb } }`.
7. Notification imports: `digest/run-digest` and `digest/build-digest` are in `operations/`; `describeDigestRow`, `renderSectionsHtml` and `DigestSection` in `helpers/render-digest-html`; `findReadableSubjectIds` in `operations/readable-subjects`; `findSubjectNames` in `notification-sources`.

## Verify

```sh
pnpm check
```
