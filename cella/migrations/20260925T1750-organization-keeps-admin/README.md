# An organization always keeps an admin

## What & why

The side-effect producer `backend/scripts/migrations/10-membership-rules.migration.ts` adds a deferred constraint trigger, `memberships_keep_org_admin`. Demoting, removing, leaving or deleting the account of an organization's last admin is refused with 409 `last_admin` (mapped in `backend/src/lib/error.ts`); deleting the organization itself stays possible.

## Blast radius

Every app: `backend/drizzle` is app-owned, so the trigger arrives only after `pnpm generate`. Code or tests that remove admin memberships outside the organization's own deletion transaction now fail at commit.

## Run

No script: manual.

## Manual steps

1. `pnpm --filter backend generate` emits a new `*_side_effects` folder with the `membership_rules` block; commit it.
2. Test cleanups that delete memberships before their organizations run in one transaction, as `backend/tests/integration/test-utils.ts` does.

## Verify

```sh
pnpm vitest run --project=backend backend/tests/security/last-admin.test.ts
pnpm check
```
