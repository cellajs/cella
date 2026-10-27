---
syncBreaking: true
clientCacheBump: false
caughtBy: tests
grep: acceptInvitationToken, invitation-accepted-elsewhere, impersonation-started, invitation_address_unproven
---

# An invitation is accepted only by an account that holds the invited address

`acceptInvitationToken` answers 403 `invitation_address_unproven` when the signed-in account does not hold the invited
address; `confirmInvitationAddress` mails that address a link bound to the account. App code that accepts an invitation
from another address, or tests that do, follow the new rule. The `invitation-accepted-elsewhere` security mail is gone,
and `impersonation-started` goes to the security inbox.

## What & why

An unbound invitation link used to be accepted by whichever account opened it, and the invited inbox was told
afterwards. A forwarded link let anyone in, and the notice mostly alarmed people who had accepted it themselves. Now the
account must hold the address, or confirm it through a link mailed there. The impersonated user cannot end an
impersonation, so its notice goes to the operator.

## Blast radius

Sync-breaking for an app with its own invitation accept page, or tests that accept from another address. An app using
the template's accept step gets the new flow with the sync. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. In app tests that accept an invitation token, sign in with the invited address, or prove it with `confirmInvitationAddress` and the mailed `confirmUrl`.
2. In an app-owned accept page, answer 403 `invitation_address_unproven` by offering `confirmInvitationAddress`.
3. Drop any app use of the `invitation-accepted-elsewhere` type and its locale keys; read `impersonation-started` as a security inbox mail.

## Verify

```sh
pnpm check
pnpm test
```
