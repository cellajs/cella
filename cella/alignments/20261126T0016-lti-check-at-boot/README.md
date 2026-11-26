---
breaking: false
clientCacheBump: false
grep: assertBroughtAlongRolesOpenNothing, organizationRoles
---

# The brought-along role check runs at boot and judges only an app that turns lti on

An app with `lti` off in every mode passes the template's LTI tests without a least organization role that opens
nothing. `assertBroughtAlongRolesOpenNothing` runs when the API boots with `lti` on, and
`lti-brought-along-role.test.ts` runs it on the app's own map when one of the app's modes turns `lti` on. An app that
added a least organization role only to pass that check may remove it.

## What & why

Since `20261121T1642-lti-brought-along-role`, the check ran when `admit-lti-person.ts` loaded. The template's LTI test
files turn `lti` on for themselves, so an app with `lti` off in every mode failed them unless every role below the
organization brought along a role that opens nothing. The check now runs in `main.api.ts`. The test reads
`configModes`, now exported from `shared/src/config-builder/app-config.ts`.

## Blast radius

Not breaking. An app with `lti` on in a mode keeps the refusal at boot and in its tests. An app with `lti` off in every
mode passes the LTI tests with any map. No lens, no cache bump, no schema change unless the app removes a role.

## Run

No script: manual.

## Manual steps

1. Stop here when a mode of the app names `lti` in `enabledAuthStrategies`, or when the least role is a product choice: a member of one channel then sees nothing else of the organization.
2. In `shared/config/hierarchy-config.ts`, map every role below the organization in `organizationRoles` to the organization role it should bring along, and remove the added role from the organization's roles.
3. Remove the role's cells from `shared/config/permissions-config.ts`.
4. Run `pnpm generate`: the `role` column default of `memberships` and `invitations` follows the new least organization role.
5. Add `data.sql` of this folder to the generated migration, with the removed role and its replacement filled in, so no stored membership or invitation keeps a role the app no longer has.
6. Check what now starts at the new least role: the invite form (`invite-submit.tsx`), an API key's service account (`api-keys-card.tsx`) and an institution sign-in (`role-from-claims.ts`).
7. Remove the role's label and description from the app's locale files, and the fork markers that template files carry for it.

## Verify

```sh
pnpm --filter backend exec vitest run tests/lti-brought-along-role.test.ts tests/lti-tool-launch.test.ts
pnpm check
```
