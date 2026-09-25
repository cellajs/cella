# Principal becomes actor

## What & why

The stored identity behind a request had two names: `principals` (the supertable, the id brand, the api_keys column,
the token claim) and `actor` (the guard output, `ActorContext`, `actorGuard`, the engine input). The template now uses
one word for the row and the request value, as it does for `user` and `organization`. `principalsTable` is
`actorsTable` in `backend/src/modules/actors/`, `PrincipalId` is `ActorId`, `api_keys.principal_id` is `actor_id`, the
access-token claim `principal_kind` is `actor_kind`, the rate-limit identifier `principalId` is `actorId`. The engine's
access field follows: `Access`, `PredicateActor`, `EngineAccess`, `ConditionActor` and `PermissionCheckOptions` carry
`actorId` where they carried `userId`, since the value was always any actor id.

## Blast radius

Sync-breaking for app code that imports from `#/modules/principals/`, reads `principalId` on an API key, or names the
`principals` table in a truncate list. Database: one migration renames the table, column, index and constraints.
Wire: the ApiKey shape carries `actorId`; nothing on the client reads it, so no `clientCacheVersion` bump. Access
tokens issued before the deploy fail verification once, then refresh.

## Run

```sh
pnpm exec tsx cella/migrations/20260923T0902-principal-to-actor/principal-to-actor.ts inventory backend/src backend/tests backend/scripts shared/src frontend/src yjs/src cdc/src   # report only
pnpm exec tsx cella/migrations/20260923T0902-principal-to-actor/principal-to-actor.ts rewrite   backend/src backend/tests backend/scripts shared/src frontend/src yjs/src cdc/src   # apply
```

## Manual steps

1. `backend/src/modules/principals/` is now `backend/src/modules/actors/` (`actors-db.ts`, `helpers/insert-actors.ts`); the sync moves the template files, the codemod rewrites imports.
2. `backend/drizzle` is app-owned (the default sync config ignores it), so the template migration `20260923100637_principal_to_actor` does not arrive: run `pnpm generate`, answer "rename" (never create + delete) for the `principals` -> `actors` table and the `principal_id` -> `actor_id` column, then add the `ALTER TABLE ... RENAME CONSTRAINT`/`ALTER INDEX ... RENAME` lines from the template's `migration.sql` to yours (drizzle keeps the `principals` names in the snapshot). The side-effects migration regenerates in the same run. If your app added tables with provenance columns, their foreign keys still point at the renamed table (Postgres keeps the reference); add matching `RENAME CONSTRAINT` lines for their `*_principals_id_fkey` names if you want them to match.
3. Any app table that references `principalsTable` directly, or any test truncate list that names `principals`, is covered by the codemod; check tables declared under a different root.
4. The codemod also rewrites the word in comments and descriptions; read the diff for "an actor" versus "a actor" and for doubled phrases such as "machine actor: the actor".
5. The engine field `userId` -> `actorId` is not in the codemod: `userId` also names the membership column. Rename it by hand wherever your app builds an `Access`, `PredicateActor`, `EngineAccess` or `ConditionActor` literal, or passes `userId` in `getAllDecisions` options; `pnpm check` lists every site as an excess-property error. Stream subscribers (`SubscriberAccess`) keep `userId`: they are users.
6. Infra code keeps `principal` for Scaleway IAM principals (`infra/lib/scaleway/principals.ts`); the codemod roots exclude `infra/` on purpose.

## Verify

```sh
pnpm sdk
pnpm check
pnpm test:core
```
