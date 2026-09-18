# The email-verification token type is removed

## What & why

`sendVerificationEmail` had no caller since password sign-up went: magic links and the OAuth
verification round trip prove address ownership themselves. Removed with it: `handleEmailVerification`,
the `email-verification` email template, its `invokeToken` branch, the `email-verification` entry in
`tokenTypes`, and the `email-verification_*` and `email.email_verification.*` locale keys.
`deleteVerificationTokens` became `deleteOAuthVerificationTokens`. The OAuth mail subject moved to
`email.oauth_verification.subject`.

## Blast radius

Not sync-breaking, no database change, no cache bump. `tokens.type` is an unconstrained varchar.
Affected only if an app calls the removed helpers, sends the removed template, or translated the
removed locale keys. The `/auth/email-verification/$reason` page stays; the OAuth flows use it.

## Run

No script: manual.

## Manual steps

1. In the app's `shared/config/config.default.ts`, remove `'email-verification'` from `tokenTypes`.
2. Replace any call to `deleteVerificationTokens(userId, 'oauth-verification', id)` with `deleteOAuthVerificationTokens(ctx, { userId, identityId })` from `#/modules/auth/auth-queries`.
3. In app locale files, delete `email-verification_expired`, `email-verification_not_found` (and their `.text` keys) and the `email.email_verification.*` keys; set `email.oauth_verification.subject` if the app translated the old subject.
4. Delete any app test mock of `#/modules/auth/general/helpers/send-verification-email`.

## Verify

```sh
grep -rn "email-verification'\|sendVerificationEmail\|deleteVerificationTokens" backend/src shared/config
pnpm sdk
pnpm check
```
