# identities are keyed on (kind, issuer, subject); provider becomes the issuer slug

## What & why

`identities.provider` and the nullable `identities.issuer` merge into one not-null `issuer`, always a slug,
namespaced by `kind`: a supported OAuth provider (`github`, `google`, `microsoft`) for `oauth`, an issuer-registry
entry for `sso` and `lti` later. The issuer URL stays in config (`providers.ts`), never in the row.
`providerUserId` is `subject`. The unique index is `identities_kind_issuer_subject_idx` on
`(kind, issuer, subject)`, replacing the expression index `identities_provider_subject_idx`. Lookups of a social
identity are scoped to `kind = 'oauth'`, so an identity of another kind can never match a social sign-in.

## Blast radius

Not sync-breaking, no cache bump, no API change (`enabledOAuth` is unchanged), database change. The generated
migration needs care so rows survive; which path depends on whether the app already applied
`20260918T0831-identities-table`.

## Run

No script: manual.

**App already on `identities`** (has `identities-db.ts` with a `provider` column): drizzle-kit reads the diff as
"`provider` dropped, `issuer` set not null", because an `issuer` column already exists. Generate, then hand-add one
line so the slug is copied before the drop:

```sh
cd backend && pnpm tsx node_modules/drizzle-kit/bin.cjs generate --config drizzle.config.ts --name identity_issuer_slug --hints '[
 {"type":"rename","kind":"column","from":["public","identities","provider_user_id"],"to":["public","identities","subject"]},
 {"type":"create","kind":"index","entity":["public","identities","identities_kind_issuer_subject_idx"]}]'
cd .. && pnpm generate
```

In the generated `migration.sql`, directly above `ALTER TABLE "identities" DROP COLUMN "provider";`, add:

```sql
UPDATE "identities" SET "issuer" = "provider";--> statement-breakpoint
```

Without it the migration fails on `SET NOT NULL` for any app with identity rows (it rolls back, nothing is lost).

**App still on `oauth_accounts`** (applies this note together with `20260918T0831-identities-table`): use these hints
instead of the ones in that note. The result is a plain rename, no hand edit:

```sh
cd backend && pnpm tsx node_modules/drizzle-kit/bin.cjs generate --config drizzle.config.ts --hints '[
 {"type":"rename","kind":"table","from":["public","oauth_accounts"],"to":["public","identities"]},
 {"type":"rename","kind":"column","from":["public","identities","provider"],"to":["public","identities","issuer"]},
 {"type":"rename","kind":"column","from":["public","identities","provider_user_id"],"to":["public","identities","subject"]},
 {"type":"create","kind":"column","entity":["public","identities","kind"]},
 {"type":"create","kind":"column","entity":["public","identities","connection_id"]},
 {"type":"create","kind":"column","entity":["public","identities","data"]},
 {"type":"create","kind":"column","entity":["public","identities","last_used_at"]},
 {"type":"rename","kind":"column","from":["public","tokens","oauth_account_id"],"to":["public","tokens","identity_id"]},
 {"type":"rename","kind":"foreign key","from":["public","tokens","tokens_oauth_account_id_oauth_accounts_id_fkey"],"to":["public","tokens","tokens_identity_id_identities_id_fkey"]},
 {"type":"rename","kind":"foreign key","from":["public","identities","oauth_accounts_user_id_users_id_fkey"],"to":["public","identities","identities_user_id_users_id_fkey"]},
 {"type":"rename","kind":"index","from":["public","identities","oauth_accounts_user_id_idx"],"to":["public","identities","identities_user_id_idx"]},
 {"type":"create","kind":"index","entity":["public","identities","identities_kind_issuer_subject_idx"]},
 {"type":"create","kind":"column","entity":["public","emails","last_verified_by"]},
 {"type":"create","kind":"column","entity":["public","emails","last_verified_at"]}]'
cd .. && pnpm generate
```

## Manual steps

1. Rename `provider` to `issuer` and `providerUserId` to `subject` wherever app code reads or writes `identitiesTable`.
2. Any app lookup of a social identity becomes `(kind = 'oauth', issuer, subject)`; keep the `kind` condition.
3. `identity.issuer` is a plain string. Where a typed `EnabledOAuthProvider` is needed, pass the provider already in
   scope (as `processCallbackResult` does) or narrow against `appConfig.enabledOAuthProviders`.

## Verify

```sh
grep -rn "providerUserId\|identitiesTable.provider\|identity.provider" backend/src backend/tests backend/scripts
pnpm --filter backend test -- tests/sign-in
pnpm check
```

After migrating a database that had identity rows: `SELECT kind, issuer, subject FROM identities;` shows the old
provider slug in `issuer` for every row.
