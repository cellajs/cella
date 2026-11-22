---
breaking: true
clientCacheBump: false
caughtBy: tests
grep: organizationRoles, assumeMembersReadPeople
generate: true
---

# The organization role a channel membership brings along opens nothing

An app with the `lti` sign-in method on maps every role of a channel below the organization, in `organizationRoles` in
`shared/config/hierarchy-config.ts`, to an organization role that is not elevated and has no grant on `user` or on the
channel types below the organization.

## What & why

`assertBroughtAlongRolesOpenNothing` in `admit-lti-person.ts` runs when the backend loads, with `lti` on. A launch gives
a membership of the context's channel, which brings along an organization membership at the role `organizationRoles`
names. Where that role reads every person and every channel of the organization, a student who opens one course page
can read every member's email address. The backend now refuses to start while that role opens more than the channel.

## Blast radius

Apps with `lti` on and channels below the organization whose brought-along role grants on people or channels: their
backend no longer starts, and every backend test fails. Products homed at the organization are not judged. No lens or
`clientCacheVersion` bump; `pnpm generate` only when the least role changes.

## Run

No script: manual.

## Manual steps

1. Name an organization role that `permissions-config.ts` gives no grant on `user` and on the channel types below the organization, and that is not in the organization's `elevated`, or add one to the organization's roles in `hierarchy-config.ts`.
2. Map every role of every channel below the organization to it in `organizationRoles`.
3. Declare it last in the organization's roles, as the least privileged.
4. Run `pnpm generate`: the `role` column default of `memberships` and `invitations` follows the least organization role.
5. Check what else takes the least organization role as its default: the invite form (`invite-submit.tsx`), an institution sign-in (`role-from-claims.ts`), an API key's service account (`api-keys-card.tsx`) and the service accounts of an LTI connection and an LTI tool installation (`connection-service-account.ts`, `lti-platform-queries.ts`).
6. An app that carries its own helper for a least organization role that reads no one, such as `assumeMembersReadPeople`, deletes it and the lines it marked in template tests: those tests now call `assumeMembersReadPeople` from `backend/tests/members-read-people.ts` themselves. Take each of those test files from the template whole and compare it with the template's: a merge without a conflict can keep the app's call beside the template's, and the typecheck reports only a doubled import.

## Verify

```sh
pnpm --filter backend exec vitest run tests/lti-tool-launch.test.ts
pnpm check
```
