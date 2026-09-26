# A membership update names a field, and personal fields show on the caller's own row

## What & why

`PUT /memberships/{id}` with no field answers 400, and any change to another member's membership needs `update` on the
channel. The update response and the invite's `data` carry `archived`, `muted` and `displayOrder` on the caller's own
membership only (`membershipAsSeenBy`, `updatedMembershipSchema`), so they no longer show another member's settings.
The SDK drops `Membership`. Verifying an address never binds a rejected invitation.

## Blast radius

Sync-breaking for apps that send empty membership updates, read personal fields from these responses, or return other
users' memberships from their own routes. No database change.

## Run

No script: manual.

## Manual steps

1. Replace the SDK `Membership` type with `UpdateMembershipResponse`; merge or guard these responses before an own-membership cache, as `frontend/src/modules/memberships/query-mutations.ts` does.
2. Pass other users' memberships returned by app routes through `membershipAsSeenBy`.

## Verify

```sh
pnpm vitest run --project=backend backend/tests/security/membership-update.test.ts backend/tests/security/rejected-invitations.test.ts backend/src/modules/memberships/helpers/select.test.ts
pnpm check
```
