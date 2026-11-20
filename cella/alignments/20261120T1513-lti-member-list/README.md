---
breaking: true
clientCacheBump: false
caughtBy: nothing
generate: true
grep: applyLtiRole, importLtiMembersOp, lti_context_memberships, ltiContextMembershipsTable, unlaunchedLtiAccountDays, ltiImportIssues, unreadable_members, lti_import
---

# LTI members follow the platform's list

As an LTI tool, a member import now also removes, and a list takes away only what a list once held. After a read of a
context's whole list that names an active member, a person an earlier list held loses what the context gave them once
the list leaves them out or names them Inactive, and their seat too when LTI gave it, nothing else holds them in the
organization and its role may not update it. The new table `lti_context_memberships` records what a context gave, with
`listed` set by an import alone. `applyLtiRole` takes the context's `contextId` and `listed`. A read with a row that
fails validation records `unreadable_members` and ends nobody. An account an import made that never signed in is
deleted after `retention.unlaunchedLtiAccountDays` once it holds no membership and its connection is gone.

## What & why

NRPS 2.0 lists a context's current members (sections 2.3 and 2.4.1): a whole list says who left. The import used to
add and update only: a student dropped from a course kept the channel, and an account made for someone who never
launched stayed for ever. A person a launch admitted whom the list never names, such as an editor who is no member,
keeps what the launch gave.

## Blast radius

Every LTI tool app: one migration with the hand-written `data.sql`, no `clientCacheVersion` bump. An operator sees
people who left a context leave its channel at its next import, and unused LTI accounts deleted. An app without the
`lti` sign-in method gets only the new table.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`: it adds the table `lti_context_memberships`, and the side-effect migration grants it and adds the retention sweep of unused LTI accounts.
2. Append this folder's `data.sql` to the end of that generated migration before it is deployed: it records the memberships an import made before the upgrade, those its connection's service account wrote in a context's channel, and their seats, as held by a list. Without it no import ends them. An app that deployed the migration already runs both statements once by hand. A membership the statements record under several contexts of one connection on the same channel ends once none of those lists holds the person.
3. Where app code calls `applyLtiRole`, pass the `contextId` of the context's row and `listed`: true for an import, false for a launch.
4. An app that gives LTI people memberships of its own, beside what a launch or an import gives, should know that those hold no record: an import never ends them, and while one is left the person keeps their seat. A parent membership that `insertMemberships` brings along with the channel's in the same step is recorded with it.
5. An app whose own rules expect a person to stay after leaving the platform, such as one that keeps a former student's work under their membership, should check what its pages show once that membership ends: the account stays, and so does what the person wrote.
6. Where the app sets its own `retention`, add `unlaunchedLtiAccountDays`; the template's privacy page states it under Account.
7. Where app code maps `ltiImportIssues` to texts, add `unreadable_members`; the template's text is `c:lti_import.unreadable_members`.

## Verify

```sh
pnpm generate
pnpm check
pnpm vitest run backend/tests/lti-member-import.test.ts backend/tests/lti-tool-launch.test.ts backend/tests/retention-rules.test.ts
```

By hand: import a context's members, remove one person on the platform and import again, and see their membership
gone and their account kept; launch as someone the platform does not list and see the next import keep them.
