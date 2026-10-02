# Auth factors move to queries and operations

## What & why

The second-factor code follows the backend layering: reads and writes are queries, everything else an operation. `verifyTotp` moves to `totps/operations/verify-totp`, the passkey challenge functions to `passkeys/operations/passkey-challenges`, `general/helpers/mfa` to `mfa/operations/` (`mfa-challenge`, `factor-rules`). TOTP and passkey queries leave `auth-queries` for `totps-queries` and `passkeys-queries`; `heldFactors(ctx, userId)` becomes `getHeldFactors(ctx, { userId })` in `mfa/mfa-queries`.

## Blast radius

Apps that import these paths, mock them in tests (`vi.mock` paths change), or call `heldFactors`; TypeScript reports each import. No database change, no `clientCacheVersion` bump. An app that never touched auth internals is unaffected.

## Run

No script: manual.

## Manual steps

1. Rewrite imports: `totps/helpers/totps` → `totps/operations/verify-totp`, `passkeys/helpers/passkey` → `passkeys/operations/passkey-challenges`, `general/helpers/mfa` → `mfa/operations/mfa-challenge` (`initiateMfa`, `validateConfirmMfaToken`, `completeMfaChallenge`) or `mfa/operations/factor-rules` (`mfaFactorRules`).
2. `insertTotp` from `totps/totps-queries`; `findCredentialIdsByUser`, `insertPasskey` from `passkeys/passkeys-queries`.
3. `heldFactors(ctx, userId)` becomes `getHeldFactors(ctx, { userId })` from `mfa/mfa-queries`.
4. Update `vi.mock` paths in your tests the same way.

## Verify

```sh
pnpm check
```
