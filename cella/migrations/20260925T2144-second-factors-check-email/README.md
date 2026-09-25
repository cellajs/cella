# Single-use second factors; check-email answers only a recognized browser

## What & why

`verifyTotp` accepts each code once (`totps.last_used_step`) and draws on a per-account failure budget.
`completeMfaChallenge` is the only way out of an MFA challenge. Passkey challenges live in `passkey_challenges` and
answer once; `passkeys.credential_id` is unique; sign-in challenges carry no email and list no credential ids.
`check-email` answers `{ recognized }`, true only for a browser that signed in to that address before. `POST /requests`
answers 204 to everyone.

## Blast radius

Sync-breaking for apps calling the removed TOTP and passkey helpers, the check-email or requests responses, or passkey
bodies with `email`. Adds a table, a column and a unique index.

## Run

No script: manual.

## Manual steps

1. Dedupe passkeys first: `SELECT credential_id FROM passkeys GROUP BY 1 HAVING count(*) > 1`.
2. `pnpm --filter backend generate` emits the table, the column, the unique index and the side-effect grants.
3. Replace `validateTOTP`, `verifyTOTPWithGracePeriod` and `validatePasskey` with `verifyTotp` and `verifyPasskeyAssertion`.
4. Read `check-email` as `{ recognized }` and treat `POST /requests` as 204.
5. Drop `email` from passkey challenge and verification bodies.

## Verify

```sh
pnpm vitest run --project=backend backend/tests/security/totp-replay.test.ts backend/tests/security/passkey-challenges.test.ts backend/tests/security/account-enumeration.test.ts
pnpm check
```
