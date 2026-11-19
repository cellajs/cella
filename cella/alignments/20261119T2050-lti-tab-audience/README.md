---
breaking: true
clientCacheBump: true
caughtBy: nothing
generate: true
grep: sumLtiImportsSince, allowsLtiTab, findLtiResourceLinks, rejectLtiInstallation, rejectLtiInstallationOp, useRejectLtiInstallationMutation, ltiInstitutionRolesIn, countLtiImportsSince, maxCoursesPerHour, readAsLauncher, lti_resource_links, lti_installations, approveLtiInstallation, updateLtiInstallationScopes, PlacementContext, placementContext, findLtiPlacements, lti_context_update_required, add_lti_tab_above, confirm.add_lti_tab, lti_contexts, ltiRolesFor, ltiInstitutionRolesFor, ltiRolesIn, lisInstitutionRoles, ltiClaims.roles, ltiContextChannelType, ltiContextRole, createLtiContextChannel, LtiContextChannelFacts, planLtiContextChannel, lti_context_not_set_up, lti_launch_no_roles
---

# LTI tabs and audiences

As an LTI tool, `ltiContextChannelType` in the app's `lti-context-channel.ts` is a function of the launch's context
that answers a channel type or null, `createLtiContextChannel` reads the type it creates from `channelType`, and
`ltiContextRole` may answer null, which refuses a launch and leaves a person out of an import. A launch without a
context, or with one `ltiContextChannelType` answers null for, signs in only a person the tenant knows as a member;
the template answers null for a context whose types name no LIS course or group, and maps one with no types to the
organization. As a platform, `ltiRolesFor` in `launch-context.ts` and the new `ltiInstitutionRolesFor` get the
person's role beside `can`, and `can` judges them as the tab's audience let them in: on a tab for its members by their
one membership in the channel, on a tab for its editors by all they hold. A tab launches as its own channel
(`linkContext` in place of `placementContext`), a channel holds one tab per LTI tool and with it one audience, and a
channel type `ltiContextTypes` makes no context holds no LTI tabs, the organization excepted.
`lti_resource_links.audience` says whom a tab opens for, `members` or `editors`, and `lti_installations.channel_types`
the channel types an admin allows an LTI tool a tab in; every use of a tab asks `ltiTabClosure` whether it opens.

## What & why

Two runs of one app inside another showed where the rules went wrong: an organization tab admitted everyone into the
LTI tool's organization, an organization admin went as Instructor where they were a student, and a tab below a course
admitted the whole course. A launch without a course now admits nobody new, the audience that admits a person judges
their role, a tab opens its own channel for its audience, and an admin chooses where each LTI tool may get a tab.

## Blast radius

Every LTI tool app: `lti-context-channel.ts` stops compiling, and a launch without a course admits nobody. Every
platform app: `launch-context.ts` stops compiling, tabs below a context need a decision, existing tabs open for
members only. Approvals without `channelTypes` still compile. One migration; `clientCacheVersion` rises.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate --hints "$(cat cella/alignments/20261119T2050-lti-tab-audience/hints.json)"` and put each statement of `data.sql` where its comment says, with the app's channel types that hold LTI tabs in its list: the organization and each type `ltiContextTypes` makes a context. The migration adds `lti_resource_links.audience`, every existing tab `members`, and `lti_installations.channel_types`, which `data.sql` fills with those of the types each LTI tool has tabs in.
2. In the app's `lti-context-channel.ts`, make `ltiContextChannelType` a function `(context: LtiContext) => ChannelEntityType | null`; its `types` arrive as full URIs (`isLisContextType`), and are empty for a context that names no type, which some platforms send: answer for that case too (the template maps it to the organization). Answer null for a context the app does not take, such as Canvas's `Account` and `User` contexts. Every context answered with a channel type gets a channel of its own: a platform's course section (`CourseSection`) becomes its own channel unless the app answers null for it.
3. In `createLtiContextChannel`, create a channel of the `channelType` it is handed. It is called only with a type `ltiContextChannelType` answers, never with the organization: a type the app never answers needs no branch, and throwing for it is fine, as the template throws for every type.
4. Make `ltiContextRole` answer null where the app gives no role: the launch is refused with `lti_launch_no_roles`, and an import leaves the person out. Its `ltiRoles` arrive as `ltiRolesAsRead` reads them: an institution Administrator with no context role also holds the context role Administrator, so the template's answer (the least privileged role for any context role, `isLisContextRole`, null for none) admits them and lets them set up a context; the institution role stays in the list for an app that answers otherwise.
5. Where app code or tests call `planLtiContextChannel`, pass the `channelType` the context maps to and the person's `ltiRoles`; it no longer reads the database. A context stored before keeps its channel (`storedLtiContextChannel`), whatever `ltiContextChannelType` answers later.
6. In the app's `launch-context.ts`, give `ltiRolesFor` a third parameter `role`: the person's role in the tab's channel, or null without a membership there. `can` judges them as the tab's audience let them in: on a tab for its members by that one membership alone, so power inherited from a channel above, such as an organization admin's over a course, no longer makes an Instructor; on a tab for its editors by all they hold, a membership or not. Keep the template's answers on `can`; answer by `role` where roles with the same rights mean different LTI roles, such as a coach and a follower who both only read.
7. Add `ltiInstitutionRolesFor(can, role)` to the app's `launch-context.ts`: `can` judges the organization through the person's membership there, and `role` is that membership's role. The template sends Administrator to whoever may update the organization and nothing to anyone else; `lisInstitutionRoles` holds the core institution roles of LTI Core A.2.2 (Administrator, Faculty, Guest, None, Other, Staff, Student), `member` gone. An app that keeps the template's answers in `launch-context.ts` takes the template's file whole.
8. Where app tests expect a launch's `roles` (`ltiClaims.roles`) to equal one role, add the institution role a person who may update the organization now carries beside it. Where they expect a launch with a context and an empty roles list to admit, expect `lti_launch_no_roles`; a launch with no roles claim at all answers `lti_launch_invalid`.
9. Where `ltiContextTypes` names no context for a channel type that holds tabs, such as a course section below a course, either make that type a context in `launch-context.ts`, or switch those tabs off with the statement in `data.sql`: they stop launching and no longer let the LTI tool read the course above, and a channel's Tabs card lists none.
10. Where app code calls `placementContext` or `findLtiPlacements`, or names the type `PlacementContext`, call `linkContext` with the resource link: there is no walk to a channel above. Drop app code that reads `context` of a listed LTI tab or of an installation's tab, the error type `lti_context_update_required` and the texts `confirm.add_lti_tab_above`, `lti_tab_context_*` and `lti_tab_reads.text`.
11. Where app code, tests or seeds approve an LTI tool (`approveLtiInstallation`, the query or the route), pass `channelTypes`: the body takes it as optional, so an approval without it compiles, allows nothing, and placing a tab then answers 409 `lti_channel_type_not_allowed`. `updateLtiInstallationScopes` is `updateLtiInstallationGrant`, which also takes `channelTypes`. A tab in a type taken away, in an archived channel or of a disabled LTI tool stays as it is and does not open: app code that lists, starts or binds tabs asks `ltiTabClosure` too.
12. Where app code calls `ltiRolesIn`, pass the person's id and their membership row in the channel in place of an access; a launch's roles come from `ltiLaunchRoles`, which also sends institution roles; `ltiInstitutionRolesIn` is gone; `readAsLauncher` answers the person's `memberships` in place of `access`, and `ownActor` builds the access that judges a person by the memberships it is given.
13. Where app code calls `countLtiImportsSince`, drop it: a connection's hourly budgets of courses and people live in the rate limit store (`takeFromImportBudget`), counted as each import starts and each page is read, retries included; a connection imports at most `maxCoursesPerHour` (150) courses and `maxPeoplePerHour` (five full imports) people an hour.
14. Where the app's `appError.json` overrides `lti_context_not_set_up` or `lti_launch_no_roles`, check its text against the new meaning, and add `lti_launch_no_context`, `lti_channel_type_not_allowed` and `lti_channel_type_holds_no_tabs` where it translates errors. Where its `app.json` overrides `confirm.add_lti_tab`, rewrite it: it asks whom the tab opens for, and its slot `course` is `channel`, which an old override renders empty; `confirm.add_lti_tab_reads` is new, and `lti_contexts` reads "Courses and groups".
15. Where app code or a client calls `rejectLtiInstallation` (`POST lti-installations/{ltiInstallationId}/~reject`), call `deleteLtiInstallation` with the query `status=pending`, which deletes a waiting LTI tool and answers 409 `lti_installation_not_pending` for one another admin approved meanwhile; `rejectLtiInstallationOp` and `useRejectLtiInstallationMutation` are gone.
16. In an LTI tool app whose contexts sit below the organization, check what the organization's least privileged role sees of people (member visibility) and what the embedded organization page shows: everyone a context admits also becomes a member of the organization at that role, and a launch without a context lands a known person on that page.
17. Where the app sets its own `clientCacheVersion`, raise it.

## Verify

```sh
pnpm generate --hints "$(cat cella/alignments/20261119T2050-lti-tab-audience/hints.json)"
pnpm check
```
