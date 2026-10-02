---
syncBreaking: true
clientCacheBump: false
---

# Database helpers move into query files

A module's helpers/ folder holds database-free code only; reads and writes are queries in
<module>-queries.ts taking (ctx, opts). insertUsers moves to user-queries ({ users,
onConflictDoNothing }), insertActors and deleteDanglingActors to the new actors-queries ({ ids, kind
}), insertServiceAccount to service-accounts-queries ({ values }). issueApiKey is replaced by
generateApiKey plus the insertApiKey query; managed-service-account.ts is gone, so operations call
getValidChannel(ctx, organizationId, 'organization', 'update') and findServiceAccountInTenant
themselves; updateServiceAccount is a tenant-scoped query. Notification reads leave helpers/:
accessForUserIds becomes getUserAccess and findChannelNames moves to notification-queries,
findSubjectNames to notification-sources, findReadableSubjectIds to operations/readable-subjects,
and readableAccess is inlined in the fan-out. digest/run-digest and digest/build-digest move to
operations/; describeDigestRow, renderSectionsHtml and DigestSection to helpers/render-digest-html.
Every notification query takes (ctx, opts); background callers pass { var: { db: baseDb } }. The
unused generateUniqueSlug is removed; an app that calls it copies it into its own module.

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
8. An app that calls `generateUniqueSlug` copies it from `backend/src/modules/entities/helpers/generate-slug.ts` at tag `0.12.2` into its own module; it queries the database, so it belongs in a queries file.

## Verify

```sh
pnpm check
```
