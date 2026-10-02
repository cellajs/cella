---
syncBreaking: true
clientCacheBump: false
---

# Auth invitation code moves to auth/invitations

The invitation code leaves auth/general for auth/invitations/operations: resend-invitation
(resendInvitationEmail) from general/helpers, accept-invitation-token and get-token-data from
general/operations, and auth-queries (maySignUp, hasPendingInvitation) becomes may-sign-up.
auth/auth-queries.ts is gone. The inactive-membership reads they made are memberships-queries
findPendingInactiveMembership and findPendingInactiveMembershipByEmail. Apps update imports and
vi.mock paths.

## What & why

`auth/general` now holds only what every sign-in method shares: the routes, cookies, `finishSignIn`, account-security mail and `strategyLabels`. Invitation operations get their own folder; their reads of `inactive_memberships` are queries in `memberships-queries`, where the table lives.

## Blast radius

Apps that import these paths or mock them in tests; TypeScript reports each import. No database change, no `clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. `auth/auth-queries` → `auth/invitations/operations/may-sign-up`.
2. `auth/general/helpers/resend-invitation` and `auth/general/operations/{accept-invitation-token,get-token-data}` → `auth/invitations/operations/` under the same file names.
3. Update `vi.mock` paths in your tests the same way.

## Verify

```sh
pnpm check
```
