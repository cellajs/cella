# The emails table records inbox proofs

## What & why

`emails` is the ledger of inboxes proven to belong to an account. Two new columns, `lastVerifiedBy`
(`'magic'` or the OAuth provider whose verification mail was clicked) and `lastVerifiedAt`, are
stamped on every proof; `verified` and `verifiedAt` only on the first. The click on an OAuth
connect's verification mail now adds a differing provider address to the ledger (`addProvenEmail`),
so a magic link for it signs in to the same account and invitations to it bind directly.
`markEmailVerified` takes `by`. The write-only `emails.tokenId` column is dropped: its one reader went with
the email-verification path.

## Blast radius

Not sync-breaking, no cache bump. Adds two nullable columns to `emails` and drops `token_id`: apps run
`pnpm generate`.
An app that calls `markEmailVerified` passes `by`. Apps with their own address writes should route
them through `addProvenEmail` so the stamps stay truthful. Nothing is deleted as a side effect.

## Run

No script: manual.

## Manual steps

1. `pnpm generate` for the two `emails` columns; keep the generated backfill (`last_verified_by = 'magic'` for rows already verified) if the app has verified rows.
2. Add `by: 'magic' | <provider>` to any app call of `markEmailVerified` or `requireEmailVerified`.
3. Remove `tokenId` from any app insert or update on `emails`.

## Verify

```sh
pnpm generate
pnpm --filter backend test -- tests/sign-in tests/invitations
pnpm check
```
