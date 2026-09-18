# oauth_accounts becomes identities, keyed on the provider subject

## What & why

`oauth_accounts` is renamed to `identities` (`backend/src/modules/auth/identities-db.ts`), the one
table for every external identity of a user: social OAuth now, SSO federations and LTI launches
later. Identity is `(provider, providerUserId, issuer)`; the asserted `email` becomes a nullable
display snapshot, out of the unique key and out of the callback lookup. New columns `kind`, `issuer`,
`connectionId`, `data`, `lastUsedAt`. `tokens.oauthAccountId` is `tokens.identityId`.
`deleteOAuthVerificationTokens` takes `identityId`.

## Blast radius

Not sync-breaking, no cache bump, database change: apps run `pnpm generate` and answer the rename
prompts (or pass the hints below). An app that only read the provider list from `oauth_accounts`
changes one import. A provider changing a user's address no longer produces a second row.

## Run

No script: manual. The schema migration needs rename hints so the data survives. The last two hints belong to
`20260918T0711-email-ledger-proof-stamps`; include them when both notes are applied in one `pnpm generate`, since
the dropped `emails.token_id` otherwise reads as a possible rename:

```sh
cd backend && pnpm tsx node_modules/drizzle-kit/bin.cjs generate --config drizzle.config.ts --hints '[
 {"type":"rename","kind":"table","from":["public","oauth_accounts"],"to":["public","identities"]},
 {"type":"rename","kind":"column","from":["public","tokens","oauth_account_id"],"to":["public","tokens","identity_id"]},
 {"type":"rename","kind":"foreign key","from":["public","tokens","tokens_oauth_account_id_oauth_accounts_id_fkey"],"to":["public","tokens","tokens_identity_id_identities_id_fkey"]},
 {"type":"rename","kind":"foreign key","from":["public","identities","oauth_accounts_user_id_users_id_fkey"],"to":["public","identities","identities_user_id_users_id_fkey"]},
 {"type":"rename","kind":"index","from":["public","identities","oauth_accounts_user_id_idx"],"to":["public","identities","identities_user_id_idx"]},
 {"type":"create","kind":"index","entity":["public","identities","identities_provider_subject_idx"]},
 {"type":"create","kind":"column","entity":["public","emails","last_verified_by"]},
 {"type":"create","kind":"column","entity":["public","emails","last_verified_at"]}]'
cd .. && pnpm generate
```

## Manual steps

1. Replace imports of `#/modules/auth/oauth/oauth-accounts-db` (`oauthAccountsTable`, `OAuthAccountModel`) with `#/modules/auth/identities-db` (`identitiesTable`, `IdentityModel`).
2. Rename `oauthAccountId` to `identityId` on token inserts and on `deleteOAuthVerificationTokens` calls.
3. Replace `oauth_accounts` in any app table list (test truncation helpers, grant lists).
4. Any app lookup of an identity by address changes to `(provider, providerUserId)`; `email` may be null.

## Verify

```sh
grep -rn "oauth_accounts\|oauthAccount" backend/src backend/tests backend/scripts
pnpm --filter backend test -- tests/sign-in
pnpm check
```
