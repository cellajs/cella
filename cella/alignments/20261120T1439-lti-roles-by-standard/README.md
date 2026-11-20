---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: ltiRolesAsRead, ltiContextRole, LtiRoleFacts, planLtiContextChannel, maxCoursesPerHour, lisRoleUri, isLisContextRole, isLisRole, lisContextRoles.administrator, lisInstitutionRoles.administrator, ltiRolesFor, ltiInstitutionRolesFor, lti_contexts, lti_import, lti_connections.text, registration_link.text, embedded_session_missing, lti_context_not_set_up, lti_launch_no_context, lti_launch_test_user, lti-nonce_expired, lti-nonce_not_found
---

# LTI roles by the standard alone

As an LTI tool, `ltiContextRole` in the app's pinned `lti-context-channel.ts` gets the roles as the platform sent them:
an institution Administrator without a context role no longer also holds the context role Administrator, and
`ltiRolesAsRead` is gone. Who sets a context up, creating its channel on the first launch and starting its member
import, follows that mapping: whoever it gives a role that may update a channel of that type. The template's answer
gives Instructor and Administrator the most privileged role. `planLtiContextChannel` takes `setsUp` in place of
`ltiRoles`, and `maxCoursesPerHour` is `maxContextsPerHour`. As a platform, the backend does not start while
`ltiRolesFor` or `ltiInstitutionRolesFor` would send a list without a LIS role. `lisRoleUri` reads only the context role
names of LTI Core A.2.3 as short names, and `isLisContextRole` and `isLisRole` count only the role names of appendix
A.2. The LTI tool texts lose "course", "teacher" and "LMS".

## What & why

Canvas sends the institution role Administrator to anyone who administers any of its accounts. Read as the context's
Administrator, it gave such a person set-up and the least privileged role in every context in the template, and the
top role in an app that mapped Administrator to it. LTI Core 1.3 keeps the role vocabularies apart (5.3.7, A.2).
Set-up followed a fixed pair of roles beside the app's mapping; the mapping now decides both.

## Blast radius

Every LTI tool app with its own `ltiContextRole`: set-up and imports follow its answers, and an institution
Administrator alone gets what it answers for those roles. A platform app whose answers send its own URIs alone does not
start. No migration, no `clientCacheVersion` bump. An education app reads neutral texts.

## Run

No script: manual.

## Manual steps

1. In the app's `lti-context-channel.ts`, check what `ltiContextRole` answers for institution or system roles alone. An app that mapped the context role Administrator to its top role gave it to every platform admin who was not enrolled; that person now gets what the app answers for `lisInstitutionRoles.administrator`, nothing in the template. An app that wants them in answers that role itself.
2. Check who sets a context up: a person the app's `ltiContextRole` gives a role that may update a channel of that type, as the permission engine judges that role alone. Give the roles that should create a context's channel and start its import such a role; a role that may update only through a row condition or from a channel above does not count. Two cases change: a sub-role the mapping gives a role that may update now sets a context up, such as `membership/Instructor#TeachingAssistant` mapped to a staff role, and an app whose least privileged role may update its channel lets every Learner set a context up. In an organization context, the role applied stays below one that may update it, as before.
3. An app that kept the template's `ltiContextRole` takes the template's function whole: Instructor and Administrator of the context get the most privileged role, any other context role the least, and institution or system roles alone none. Without it, nobody sets a context up and no member import starts.
4. Take the template's comments on `LtiRoleFacts.ltiRoles`, `LtiContextChannelFacts.createdBy`, `createLtiContextChannel` and `ltiContextRole` into the app's copy: the sentences about the promotion are gone.
5. In app code and tests, replace `ltiRolesAsRead(roles)` with `roles` and `maxCoursesPerHour` with `maxContextsPerHour`, and pass `planLtiContextChannel` a `setsUp` from `setsUpLtiContext` in place of `ltiRoles`.
6. Only the eight context roles of LTI Core A.2.3 and their sub-roles count as context roles (`isLisContextRole`), short or in full: `Owner` stays `Owner`, and `membership#Owner` is no context role. A mapping that matched such a name matches it as it comes, or not at all.
7. As a platform, start the backend once: it names the input when `ltiRolesFor` or `ltiInstitutionRolesFor` in `launch-context.ts` answers a list that is not empty without a LIS role. `lisContextRoles` now holds Manager, Member and Officer, `lisInstitutionRoles` the institution roles that are not core too, and `lisSystemRoles` the system roles: a role the check counts (`isLisRole`) is one of these or a context sub-role.
8. An education app puts its words back: in `shared/locales/en/app.json` for `lti_connections.text`, `lti_contexts`, `lti_contexts.failed`, `registration_link.text` and the `lti_import.*` texts, and in `appError.json` for `embedded_session_missing.text`, `lti_context_not_set_up.text`, `lti_launch_no_context`, `lti_launch_no_context.text`, `lti_launch_test_user.text` and the two `lti-nonce_*` texts. `backend:lti.storage_unanswered` has no override file: edit the app's `backend.json`.

## Verify

```sh
pnpm vitest run backend/src/lib/lti-vocabulary.test.ts backend/tests/lti-tool-launch.test.ts backend/tests/lti-member-import.test.ts
pnpm check
```

By hand: launch as an institution Administrator with no context role and see the launch refused unless the app's
mapping answers that role; launch as an Instructor into a context below the organization nobody opened and see its
channel created and its member import queued.
