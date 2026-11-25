---
breaking: false
clientCacheBump: false
grep: getLeastPrivilegedRole, roleFromClaims
generate: true
---

# A channel names the role people start at apart from its least privileged role

An app whose people should start above its least privileged organization role, such as one that declared a role that
opens nothing last for `20261121T1642-lti-brought-along-role`, names it as `defaultRole` on `organization()` in
`shared/config/hierarchy-config.ts`, switches the default of its pinned `role-from-claims.ts` to
`hierarchy.getDefaultRole('organization')` and runs `pnpm generate`.

## What & why

`EntityHierarchy.getDefaultRole` answers the role a person or an API key's account starts at when nobody picks one:
the channel's `defaultRole`, else its least privileged role. The invite form's preselection, a new API key's service
account, an institution sign-in's membership and the `role` column default of `memberships` and `invitations` read it.
The grant rule, a brought-along membership and an LTI admission keep `getLeastPrivilegedRole`.

## Blast radius

Not breaking: an app that names no `defaultRole` keeps every role, and `pnpm generate` writes nothing. An app that
names one gets a migration of the two column defaults, and the template's tests take that role as their plain member.
No lens or `clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. In `shared/config/hierarchy-config.ts`, add `defaultRole` to `organization()`, such as `defaultRole: 'member'` beside a `guest` declared last; a channel below the organization takes one the same way.
2. In the pinned `backend/src/modules/auth/flows/sso/role-from-claims.ts`, replace the default `hierarchy.getLeastPrivilegedRole('organization')` with `hierarchy.getDefaultRole('organization')`, unless the app maps claims of its own: `sso.test.ts` expects the default role.
3. Run `pnpm generate`: the migration sets the `role` column default of `memberships` and `invitations` to the default role and nothing else. Existing rows keep their roles.
4. Drop a grant the app gave its least role only for the template's tests, such as `read` on the organization or an attachment cell: those tests take the default role as their plain member.
5. App code that calls `getLeastPrivilegedRole` for the role someone starts at, such as an own invite form or a seed, calls `getDefaultRole`; a check of who may hand out what keeps the least role.

## Verify

```sh
pnpm generate
pnpm --filter backend exec vitest run tests/sign-in/sso.test.ts tests/security/role-grants.test.ts
pnpm check
```
