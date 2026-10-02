---
syncBreaking: true
clientCacheBump: false
---

# Account creation, email proof and magic links move to operations

Account creation and email proof move from auth/general/helpers to user/operations: user to
create-account (handleCreateUser), mark-email-verified to email-proof (markEmailVerified,
requireEmailVerified, addProvenEmail), claim-email to claim-email. The three email-proof functions
take a database context first, where they took a db or tx. The EmailProof type moves to
user/emails-db. handle-magic moves from auth/general/helpers, and magic-link-browser and
magic-sign-up from auth/magic/helpers, all to auth/magic/operations; the magic-link mail is
sendMagicLinkOp in auth/magic/operations/send-magic-link. Apps update imports and calls.

## What & why

Reads and writes of `emails` are queries in `user-queries` (`insertEmail`, `updateEmailProof`, `upsertProvenEmail`); account creation and email proof are operations, so `auth/general/helpers` keeps database-free code. The magic link code becomes operations in `auth/magic/operations/`.

## Blast radius

Apps that import these paths, mock them in tests, or call the email-proof functions with a `db` or `tx`; TypeScript reports each call. No database change, no `clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. `auth/general/helpers/user` → `user/operations/create-account`; `auth/general/helpers/mark-email-verified` → `user/operations/email-proof`; `auth/general/helpers/claim-email` → `user/operations/claim-email`.
2. `markEmailVerified(db, opts)`, `requireEmailVerified(db, opts)`, `addProvenEmail(db, opts)` → pass `{ var: { db } }` (or `{ var: { db: tx } }`) first.
3. `EmailProof` from `user/emails-db`.
4. `auth/general/helpers/handle-magic`, `auth/magic/helpers/magic-link-browser` and `auth/magic/helpers/magic-sign-up` → `auth/magic/operations/` under the same file names.
5. Update `vi.mock` paths in your tests the same way.

## Verify

```sh
pnpm check
```
