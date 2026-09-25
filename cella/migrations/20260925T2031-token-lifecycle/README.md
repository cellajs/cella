# One token lifecycle module; sign-ups create accounts after the inbox is proven

## What & why

`backend/src/modules/auth/tokens/` is the only importer of `tokens-db` (a Biome `noRestrictedImports` rule):
`tokenPolicies` (lifetime, single-use window, carrier, SameSite per type), `issueToken`, `invokeToken`,
`readBoundToken`, `spendCookieToken`. A magic-link or OAuth sign-up creates the account when its link is clicked;
`tokens.pending_sign_up` holds a pending OAuth sign-up. `get-valid-token.ts` and `get-valid-single-use-token.ts` are
gone.

## Blast radius

Sync-breaking for apps that read or write `tokensTable` outside the module, add token types, or create users at
sign-up request time. Adds one column.

## Run

No script: manual.

## Manual steps

1. `pnpm --filter backend generate` emits the `tokens.pending_sign_up` column.
2. Move direct `tokensTable` reads and writes into `backend/src/modules/auth/tokens/`.
3. Give every app token type a `tokenPolicies` entry.
4. Replace `getValidToken` and `getValidSingleUseToken` with `invokeToken`, `readBoundToken` or `spendCookieToken`.
5. `findInvitationToken` takes `{ id } | { inactiveMembershipId }`.

## Verify

```sh
pnpm vitest run --project=backend backend/tests/security/magic-link.test.ts backend/tests/security/mfa-challenge.test.ts backend/tests/sign-in
pnpm check
```
