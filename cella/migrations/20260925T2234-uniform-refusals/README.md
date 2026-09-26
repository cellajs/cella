# One refusal for what the caller may not see; invitations reveal no accounts

## What & why

`tenantGuard` answers one 403 for a missing, inactive or inaccessible tenant, and admits a tenant's creator only until
it has an organization. `getValidProduct` answers 404 for an unreadable row. Pending invitations show the invited
address only, resend works by row id, and rejected invitations are final. Notifications and digests follow current
access. Members see `archived`, `muted` and `displayOrder` on their own row only. A `blob:` key is never signed.

## Blast radius

Sync-breaking for apps reading these statuses or fields, or calling `loadActiveTenant`, `findMembershipAwareRows` or
the digest queries. No database change.

## Run

No script: manual.

## Manual steps

1. Rename `loadActiveTenant` to `loadTenant` (it returns undefined for an unknown id).
2. Replace `findMembershipAwareRows` with `findInvitationAccounts` and `findInvitationsToAddresses`.
3. Pass `since` to `buildDigestForUser` and `findUndigestedNotifications`.
4. Treat an unknown tenant as 403 and an unreadable product as 404.

## Verify

```sh
pnpm vitest run --project=backend backend/tests/security/tenant-access.test.ts backend/tests/security/pending-invitations.test.ts backend/tests/security/notification-access.test.ts
pnpm check
```
