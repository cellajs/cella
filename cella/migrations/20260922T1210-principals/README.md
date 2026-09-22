# principals: one actor table behind every provenance column

## What & why

New `principals (id, kind)` table; `users.id` is now a foreign key to it and `createdBy` / `updatedBy` /
`deletedBy` in `productColumns` and `channelColumns` reference `principals` instead of `users`. Users are
inserted through `insertUsers()` (`backend/src/modules/user/helpers/insert-users.ts`), which writes the
principal row first. `ActorContext` (`#/core/context`) is the new supertype of `AuthContext` with
`principalId`, `grants`, `actor`, `scopes`, `credential`, `authStrategy`; `accessFrom` / `actorFrom` read
`principalId` and `grants`. Error bodies carry `requestId`. Prepares service accounts (AUTH_SUBSTRATE_PLAN
Phase A).

## Blast radius

Database change, not sync-breaking, no cache bump, API adds one optional error field. Every app is affected:
product tables inherit the re-pointed foreign keys, and any `db.insert(usersTable)` outside `insertUsers`
fails on the new constraint until rewritten. Apps that never customized auth need only the steps below.

## Run

No script: manual.

```sh
cd backend && pnpm tsx node_modules/drizzle-kit/bin.cjs generate --config drizzle.config.ts --hints '[
 {"type":"create","kind":"foreign key","entity":["public","<product_table>","<product_table>_created_by_principals_id_fkey"]},
 {"type":"create","kind":"foreign key","entity":["public","<product_table>","<product_table>_updated_by_principals_id_fkey"]},
 {"type":"create","kind":"foreign key","entity":["public","<product_table>","<product_table>_deleted_by_principals_id_fkey"]},
 {"type":"create","kind":"foreign key","entity":["public","organizations","organizations_created_by_principals_id_fkey"]},
 {"type":"create","kind":"foreign key","entity":["public","organizations","organizations_updated_by_principals_id_fkey"]}]'
cd .. && pnpm generate
```

One `create` hint per provenance column of every product and channel table (drizzle-kit lists the exact
constraint names it needs when run without hints).

## Manual steps

1. In the generated `migration.sql`, insert the backfill directly after `CREATE TABLE "principals"` and before
   any `ADD CONSTRAINT`: `INSERT INTO "principals" ("id", "kind", "created_at") SELECT "id", 'user', "created_at" FROM "users";`
2. Replace every `db.insert(usersTable)` in app code, seeds and tests with `insertUsers(db, records, { onConflictDoNothing })`.
3. Add `principals` to test `TRUNCATE` lists that include `users`.
4. Add `'principals'` to `fullCrudTables` in `backend/scripts/migrations/10-rls.migration.ts` if the app pins that file.
5. App operations that only need the actor's id: change `AuthContext` to `ActorContext` and `ctx.var.user.id` to
   `ctx.var.principalId`, `ctx.var.memberships` to `ctx.var.grants`. Operations reading `user.name` / `email` stay on `AuthContext`.
6. `withAuditUserLite` is gone; use `withAuditUser(ctx, entity)`.

## Verify

```sh
grep -rn "insert(usersTable)" backend/src backend/scripts backend/tests
grep -rn "withAuditUserLite" backend/src
pnpm generate
pnpm sdk
pnpm check
```
