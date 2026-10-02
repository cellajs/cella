---
syncBreaking: true
clientCacheBump: false
---

# Auth factors move to queries and operations

The second-factor code follows the backend layering. verifyTotp moves from totps/helpers/totps to
totps/operations/verify-totp; issuePasskeyChallenge, verifyPasskeyRegistration and
verifyPasskeyAssertion from passkeys/helpers/passkey to passkeys/operations/passkey-challenges;
general/helpers/mfa splits into mfa/operations/mfa-challenge (initiateMfa, validateConfirmMfaToken,
completeMfaChallenge) and mfa/operations/factor-rules (mfaFactorRules). TOTP and passkey reads and
writes are queries in totps/totps-queries and passkeys/passkeys-queries (insertTotp,
findCredentialIdsByUser and insertPasskey leave auth-queries); heldFactors(ctx, userId) becomes
getHeldFactors(ctx, { userId }) in mfa/mfa-queries; the MFA row lock is user-queries
findUserForUpdate. The toggleMfa handler body becomes me/operations/toggle-mfa. Apps update imports
and vi.mock paths.

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
