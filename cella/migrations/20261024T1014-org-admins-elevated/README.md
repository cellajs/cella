---
syncBreaking: true
clientCacheBump: false
---

# Only organization admins are elevated by default

`shared/config/hierarchy-config.ts` declares `.organization({ roles: roles.all, elevated: ['admin'], ... })`: an org
member's product grants reach rows homed at the organization, an admin's reach rows homed anywhere in it. An app with
sub-channels lists in `elevated` exactly the org roles whose product grants must reach every sub-channel, and checks each
`organizationRoles` map that escalates to one of them.

## What & why

With `elevated: roles.all`, a sub-channel's `organizationRoles` escalation (a project member becomes an org member)
handed each sub-channel member the org member's product grants in every sibling sub-channel. `resolveScopes` in
`backend/src/permissions/collection-scope.ts` no longer narrows a grant held at a product's parent level, so a
non-elevated org role keeps `ok` catchup answers on organization-homed products, as the engine and `computeCan` do.

## Blast radius

Apps with sub-channels that keep or merge the new line: `channels.organization.member` rows on products homed below the
organization stop applying. Apps whose products all sit on the organization are unaffected. No database change, no
`clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. In `shared/config/hierarchy-config.ts`, list in the organization's `elevated` exactly the roles whose product grants must reach every sub-channel.
2. For each elevated role, read its `channels.organization.<role>` rows on products homed below the organization in `shared/config/permissions-config.ts`: every member of a sub-channel whose `organizationRoles` maps to that role holds them in all sibling sub-channels.

## Verify

```sh
grep -n "elevated" shared/config/hierarchy-config.ts
pnpm check
```
