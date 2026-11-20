---
breaking: true
clientCacheBump: false
caughtBy: nothing
generate: true
grep: applyLtiRole, importLtiMembersOp, lti_context_memberships, ltiContextMembershipsTable, refusedByPlatform, refused_by_platform, unlaunchedLtiAccountDays, mockConnectionResponse, mockLtiConnectionResponse
---

# LTI members follow the platform's list

As an LTI tool, a member import now also removes: after a read of a context's whole list that names an active member,
a person the context admitted loses that membership once the list leaves them out or names them Inactive, and their
seat too when LTI gave it and nothing else holds them in the organization. The new table `lti_context_memberships`
records which memberships a context gave, and `applyLtiRole` takes the context's `contextId`. An account an import
made that never signed in is deleted after `retention.unlaunchedLtiAccountDays` once it holds no membership and its
connection is gone. `connections.refused_by_platform` marks a connection whose platform answered a token request with
`invalid_client`.

## What & why

NRPS 2.0 lists a context's current members (sections 2.3 and 2.4.1): a whole list says who left. The import used to
add and update only: a student dropped from a course kept the channel, and an account made for someone who never
launched stayed for ever. Deleting an LTI tool on a platform sends nothing; a refused token request is the only sign,
and the LTI connections card now shows it.

## Blast radius

Every LTI tool app: one migration without hand-written SQL, no `clientCacheVersion` bump. An operator sees people who
left a context leave its channel at its next import, unused LTI accounts deleted, and a refused connection marked.
Memberships given before the upgrade stay.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`: it adds the table `lti_context_memberships` and the column `connections.refused_by_platform`, and the side-effect migration grants the table and adds the retention sweep of unused LTI accounts. No hand-written statement is needed.
2. Memberships an LTI launch or import gave before the upgrade hold no record, and no import ends them. A person an admin removes is recorded when a launch or an import admits them again. Re-seed a development database to start under the rule.
3. Where app code calls `applyLtiRole`, pass the `contextId` of the context's row: it records the seat and the channel's membership as that context's, where the context made them or another context gave them.
4. An app that gives LTI people memberships of its own, such as a parent membership `insertMemberships` brings along or one its code adds beside a launch, should know that those hold no record: an import never ends them, and while one is left the person keeps their seat.
5. An app whose own rules expect a person to stay after leaving the platform, such as one that keeps a former student's work under their membership, should check what its pages show once that membership ends: the account stays, and so does what the person wrote.
6. Where the app sets its own `retention`, add `unlaunchedLtiAccountDays`; the template's privacy page states it under Account.
7. Where app code or tests build a `Connection` by hand, add `refusedByPlatform: false`; an app's own connections card can read it as the LTI connections card does.

## Verify

```sh
pnpm generate
pnpm check
pnpm vitest run backend/tests/lti-member-import.test.ts backend/tests/retention-rules.test.ts
```

By hand: import a context's members, remove one person on the platform and import again, and see their membership
gone and their account kept; delete the LTI tool on the platform and see the connection say the platform refuses it at
the next import.
