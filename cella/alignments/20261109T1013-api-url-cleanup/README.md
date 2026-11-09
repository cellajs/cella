---
breaking: true
clientCacheBump: true
caughtBy: nothing
grep: entities/app/stream, AppStreamSubscriber, AppStreamProductEvent, appStreamManager, postAppCatchup, PostAppCatchupResponse, getAppStream, getStepUpPasskeyChallenge, batchDeleteMemberships, BatchDeleteMembershipsData, checkMembershipInvite, memberships:invite, memberships:check-invite, memberships:batch-delete, metrics/public, system-invitations, notifications/resubscribe, magic/send, magic/pending, magic/confirm, mfa/pending, invitation-token/, passkey-verification, totp-verification, passkey/generate-challenge, totp/generate-key, step-up/code, step-up/passkey-challenge, sso/recovery-link, auth/oauth-connect
---

# The stream moves to /me/stream and auth actions go flat

Run `pnpm sdk` and rename what typecheck flags: `postAppCatchup` is `catchUpMyStream`, `getStepUpPasskeyChallenge` is `generateStepUpPasskeyChallenge`, `batchDeleteMemberships` is `batchDeleteMembers`, `checkMembershipInvite` is `checkMemberInvite`, the `AppStream*` names are `Stream*`, and `deletePasskey` takes `passkeyId`. A URL an app spells out by hand, in a test, form or script, changes to the path in the table below.

## What & why

The one stream carried `app` only to tell it from a public stream removed in July. It moves under `/me`, and its catchup becomes the custom method `:catch-up`. Auth actions no spec pins take one flat shape, `/auth/<verb>-<noun>`. `/auth/passkey` becomes the `/auth/passkeys` collection, and three other routes take the form the resource conventions ask for. Invite, check-invite and batch-delete move to `members`, whose IDs name people.

## Blast radius

An app that names a moved URL or a renamed SDK function. Emailed links and the OAuth and SSO callbacks are unchanged. A tab on an older bundle gets no live updates until it reloads. Bumps `clientCacheVersion`. No database change.

## Run

No script: manual.

## Manual steps

1. Run `pnpm sdk`, then rename each identifier typecheck flags, as the summary lists.
2. Replace each old path an app spells out by hand with its new one:

| Old | New |
|---|---|
| `GET /entities/app/stream` | `GET /me/stream` |
| `POST /entities/app/stream` | `POST /me/stream:catch-up` |
| `GET /metrics/public` | `GET /public/metrics` |
| `GET /system-invitations:count` | `GET /system:count-invitations` |
| `POST /notifications/resubscribe` | `POST /notifications:resubscribe` |
| `POST .../memberships:invite` | `POST .../members:invite` |
| `POST .../memberships:check-invite` | `POST .../members:check-invite` |
| `POST .../memberships:batch-delete` | `POST .../members:batch-delete` |
| `POST /auth/magic/send` | `POST /auth/send-magic-link` |
| `GET /auth/magic/pending` | `GET /auth/pending-magic-link` |
| `POST /auth/magic/confirm` | `POST /auth/confirm-magic-link` |
| `GET /auth/mfa/pending` | `GET /auth/pending-mfa` |
| `POST /auth/invitation-token/accept` | `POST /auth/accept-invitation-token` |
| `POST /auth/invitation-token/confirm-address` | `POST /auth/confirm-invitation-address` |
| `POST /auth/oauth-connect` | `POST /auth/start-oauth-connect` |
| `POST /auth/passkey` | `POST /auth/passkeys` |
| `DELETE /auth/passkey/{id}` | `DELETE /auth/passkeys/{passkeyId}` |
| `POST /auth/passkey/generate-challenge` | `POST /auth/generate-passkey-challenge` |
| `POST /auth/passkey-verification` | `POST /auth/sign-in-with-passkey` |
| `POST /auth/totp/generate-key` | `POST /auth/generate-totp-key` |
| `POST /auth/totp-verification` | `POST /auth/sign-in-with-totp` |
| `POST /auth/sso/recovery-link` | `POST /auth/send-sso-recovery-link` |
| `POST /auth/step-up/code` | `POST /auth/send-step-up-code` |
| `POST /auth/step-up/passkey-challenge` | `POST /auth/generate-step-up-passkey-challenge` |

## Verify

```sh
pnpm check
```
