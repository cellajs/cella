---
breaking: true
clientCacheBump: true
caughtBy: nothing
generate: true
grep: sumLtiImportsSince, lti_tab_course_archived, lti_tab_course_required, lti_tab_context_archived, lti_tab_context_required, lti_tab_reads, lti_installation_not_pending, lti_launch_invalid, lti_channel_type_not_allowed, allowsLtiTab, findLtiResourceLinks, rejectLtiInstallation, rejectLtiInstallationOp, useRejectLtiInstallationMutation, ltiInstitutionRolesIn, countLtiImportsSince, maxCoursesPerHour, readAsLauncher, lti_resource_links, lti_installations, approveLtiInstallation, updateLtiInstallationScopes, PlacementContext, placementContext, findLtiPlacements, lti_context_update_required, add_lti_tab_above, confirm.add_lti_tab, lti_contexts, ltiRolesFor, ltiInstitutionRolesFor, ltiRolesIn, lisInstitutionRoles, ltiClaims.roles, ltiContextChannelType, ltiContextRole, createLtiContextChannel, LtiContextChannelFacts, planLtiContextChannel, lti_context_not_set_up, lti_launch_no_roles
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

Each step says whether the compiler finds its sites; the others take the `grep` list.

1. Not caught by the compiler. Run `pnpm generate --hints "$(cat cella/alignments/20261119T2050-lti-tab-audience/hints.json)"` and put each statement of `data.sql` where its comment says, with the app's channel types that hold LTI tabs in its list: the organization and each type `ltiContextTypes` makes a context, and of those only the types whose pages show LTI tabs in the app's layouts. The migration adds `lti_resource_links.audience`, every existing tab `members`, and `lti_installations.channel_types`, which `data.sql` fills with those of the listed types each LTI tool has tabs in; a type left out stays unallowed until an admin allows it.
2. Caught by the compiler. In the app's `lti-context-channel.ts`, make `ltiContextChannelType` a function `(context: LtiContext) => ChannelEntityType | null`; its `types` arrive as full URIs (`isLisContextType`), and are empty for a context that names no type, which some platforms send: answer for that case too (the template maps it to the organization). Answer null for a context the app does not take, such as Canvas's `Account` and `User` contexts. Every context answered with a channel type gets a channel of its own: a platform's course section (`CourseSection`) becomes its own channel unless the app answers null for it.
3. Not caught by the compiler. In `createLtiContextChannel`, create a channel of the `channelType` it is handed. It is called only with a type `ltiContextChannelType` answers, never with the organization: a type the app never answers needs no branch, and throwing for it is fine, as the template throws for every type.
4. Not caught by the compiler. Make `ltiContextRole` answer null where the app gives no role: a launch is refused with `lti_launch_no_roles`, and an import leaves the person out. At a launch and in an import alike, its `ltiRoles` arrive as `ltiRolesAsRead` reads them: a platform's admin who is not enrolled, an institution Administrator with no context role, also holds the context role Administrator. Every app takes them as the context's Administrator, and no answer can tell them from an enrolled one: an app that maps Administrator to an elevated role hands that role to such an admin too.
5. Caught by the compiler. Where app code or tests call `planLtiContextChannel`, pass the `channelType` the context maps to and the person's `ltiRoles`; it no longer reads the database. A context stored before keeps its channel (`storedLtiContextChannel`), whatever `ltiContextChannelType` answers later.
6. Caught by the compiler. In the app's `launch-context.ts`, give `ltiRolesFor` a third parameter `role`: the person's role in the tab's channel, or null without a membership there. `can` judges them as the tab's audience let them in: on a tab for its members by that one membership alone, so power inherited from a channel above, such as an organization admin's over a course, no longer makes an Instructor; on a tab for its editors by all they hold, a membership or not. Keep the template's answers on `can`; answer by `role` where roles with the same rights mean different LTI roles, such as a coach and a follower who both only read.
7. Caught by the compiler. Add `ltiInstitutionRolesFor(can, role)` to the app's `launch-context.ts`: `can` judges the organization through the person's membership there, and `role` is that membership's role. The template sends Administrator to whoever may update the organization and nothing to anyone else; `lisInstitutionRoles` holds the core institution roles of LTI Core A.2.2 (Administrator, Faculty, Guest, None, Other, Staff, Student), `member` gone. An app that keeps the template's answers in `launch-context.ts` takes the template's file whole.
8. Not caught by the compiler. Where app tests expect a launch's `roles` (`ltiClaims.roles`) to equal one role, add the institution role a person who may update the organization now carries beside it. Where they expect a launch with a context and an empty roles list to admit, expect `lti_launch_no_roles`; a launch with no roles claim at all answers `lti_launch_invalid`.
9. Not caught by the compiler. Where `ltiContextTypes` names no context for a channel type that holds tabs, such as a course section below a course, those tabs stop launching and no longer let the LTI tool read the course above, whether or not the data statement runs, and a channel's Tabs card lists none. Make that type a context in `launch-context.ts` to keep them, or run the statement in `data.sql` that switches them off, so the LTI tools card shows them off.
10. Caught by the compiler. Where app code calls `placementContext` or `findLtiPlacements`, or names the type `PlacementContext`, call `linkContext` with the resource link: there is no walk to a channel above. Drop app code that reads `context` of a listed LTI tab or of an installation's tab, the error type `lti_context_update_required` and the text `confirm.add_lti_tab_above`, and the texts an app's locale overrides from its base: `lti_tab_course_archived.text` and `lti_tab_course_required.text` before cella#1885, `lti_tab_context_archived.text`, `lti_tab_context_required.text` and `lti_tab_context_required_unnamed.text` after it. `lti_tab_reads.text` stays with a new sentence: rewrite an override of it.
11. Not caught by the compiler. Where app code, tests or seeds approve an LTI tool (`approveLtiInstallation`, the query or the route), pass `channelTypes`: the body takes it as optional, so an approval without it compiles, allows nothing, and placing a tab then answers 409 `lti_channel_type_not_allowed`. `updateLtiInstallationScopes` is `updateLtiInstallationGrant`, which also takes `channelTypes`. A tab in a type taken away, in an archived channel or of a disabled LTI tool stays as it is and does not open: app code that lists, starts or binds tabs asks `ltiTabClosure` too, whose reasons are the error types `lti_tab_type_not_allowed`, `lti_tab_type_holds_no_tabs` and `lti_tab_channel_archived` beside `lti_tab_switched_off` and `lti_installation_not_active`.
12. Caught by the compiler. Where app code calls `ltiRolesIn`, pass the person's id and their membership row in the channel in place of an access; a launch's roles come from `ltiLaunchRoles`, which also sends institution roles; `ltiInstitutionRolesIn` is gone; `readAsLauncher` answers the person's `memberships` in place of `access`, and `membershipActorVars` gives the context vars that judge a person by the memberships it is given.
13. Caught by the compiler. Where app code calls `countLtiImportsSince`, drop it: a connection's budgets of courses and people live in the rate limit store, in fixed windows of an hour, counted as each import starts and each page is read, retries included; a connection imports at most `maxCoursesPerHour` (150) courses and `maxPeoplePerHour` (five full imports) people in a window, the count passing it by one page at most.
14. Not caught by the compiler. Where the app's `appError.json` overrides `lti_context_not_set_up`, `lti_launch_no_roles`, `lti_launch_invalid` or `lti_installation_not_pending`, check its text against the new meaning, and add `lti_launch_no_context`, `lti_channel_type_not_allowed`, `lti_channel_type_holds_no_tabs`, `lti_tab_type_not_allowed`, `lti_tab_type_holds_no_tabs` and `lti_tab_channel_archived` where it translates errors. Where its `app.json` overrides `confirm.add_lti_tab`, rewrite it: it asks whom the tab opens for, and its slot `course` is `channel`, which an old override renders empty; `confirm.add_lti_tab_reads` is new, and `lti_contexts` reads "Courses and groups".
15. Caught by the compiler. Where app code or a client calls `rejectLtiInstallation` (`POST lti-installations/{ltiInstallationId}/~reject`), call `deleteLtiInstallation`, which deletes an LTI tool in any state, a waiting one included; `rejectLtiInstallationOp` and `useRejectLtiInstallationMutation` are gone.
16. Not caught by the compiler. In an LTI tool app whose contexts sit below the organization, check what the organization's least privileged role sees of people (member visibility) and what the embedded organization page shows, the app's `embeddedChannelRouteConfig.organization` in its pinned `frontend/src/routes-config.tsx`: everyone a context admits also becomes a member of the organization at that role, and a launch without a context lands a known person on that page.
17. Not caught by the compiler. Where the app sets its own `clientCacheVersion`, raise it.

## Verify

```sh
pnpm generate --hints "$(cat cella/alignments/20261119T2050-lti-tab-audience/hints.json)"
pnpm check
```
