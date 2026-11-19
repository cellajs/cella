---
breaking: true
clientCacheBump: true
caughtBy: compiler
generate: true
grep: sumLtiImportsSince, allowsLtiTab, findLtiResourceLinks, rejectLtiInstallation, rejectLtiInstallationOp, useRejectLtiInstallationMutation, ltiInstitutionRolesIn, countLtiImportsSince, maxCoursesPerHour, readAsLauncher, lti_resource_links, lti_installations, approveLtiInstallation, updateLtiInstallationScopes, placementContext, findLtiPlacements, lti_context_update_required, add_lti_tab_above, ltiRolesFor, ltiInstitutionRolesFor, ltiRolesIn, ltiContextChannelType, ltiContextRole, createLtiContextChannel, LtiContextChannelFacts, planLtiContextChannel, lti_context_not_set_up, lti_launch_no_roles
---

# LTI tabs and audiences

As an LTI tool, `ltiContextChannelType` in the app's `lti-context-channel.ts` is a function of the launch's context
that answers a channel type or null, `createLtiContextChannel` reads the type it creates from `channelType`, and
`ltiContextRole` may answer null, which refuses a launch and leaves a person out of an import. A launch without a
context, or with a context of no LIS course or group type, signs in only a person the tenant knows as a member. As a
platform, the `can` that `ltiRolesFor` in `launch-context.ts` reads is judged for the person's membership in the
context channel alone, and the new `ltiInstitutionRolesFor` maps their organization membership to institution roles. A
tab launches as its own channel (`linkContext` in place of `placementContext`), and a channel type `ltiContextTypes`
makes no context holds no LTI tabs, the organization excepted. `lti_resource_links.audience` says whom a tab opens
for, `members` or `editors`, which its list, its start and its launch check alike (`opensFor`), and
`lti_installations.channel_types` the channel types an admin allows an LTI tool a tab in.

## What & why

Two runs of one app inside another showed where the rules went wrong: an organization tab admitted everyone into the
LTI tool's organization, an organization admin went as Instructor where they were a student, and a tab below a course
admitted the whole course. A launch without a course now admits nobody new, a role comes from the membership in the
context, a tab opens its own channel for its audience, and an admin chooses where each LTI tool may get a tab.

## Blast radius

Every LTI tool app: `lti-context-channel.ts` stops compiling, and a launch without a course admits nobody. Every
platform app: `launch-context.ts` needs `ltiInstitutionRolesFor`, inherited power makes no Instructor, tabs below a
context need a decision, existing tabs open for members only. One migration; `clientCacheVersion` rises.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate --hints "$(cat cella/alignments/20261119T2050-lti-tab-audience/hints.json)"` and put each statement of `data.sql` where its comment says. The migration adds `lti_resource_links.audience`, every existing tab `members`, and `lti_installations.channel_types`, which `data.sql` fills with the types of each LTI tool's tabs.
2. In the app's `lti-context-channel.ts`, make `ltiContextChannelType` a function `(context: LtiContext) => ChannelEntityType | null`: null for a context the app does not take, such as Canvas's `Account` and `User` contexts (`isLisContextType`); its `types` arrive as full URIs.
3. In `createLtiContextChannel`, create a channel of the `channelType` it is handed.
4. Make `ltiContextRole` answer null where the app gives no role: the launch is refused with `lti_launch_no_roles`, and an import leaves the person out. The template answers the least privileged role for a context role (`isLisContextRole`), the same for a launch with the institution role Administrator alone (`lisInstitutionRoles.administrator`), and null for a launch with neither.
5. Where app code or tests call `planLtiContextChannel`, pass the `channelType` the context maps to.
6. In the app's `launch-context.ts`, check that `ltiRolesFor` still answers what the app means now that `can` sees one membership: power inherited from a channel above, such as an organization admin's over a course, no longer makes an Instructor. A person without a membership, whom only a tab for its editors lets in, goes as the LIS context role Administrator (`ltiLaunchRoles`), never through `ltiRolesFor`.
7. Add `ltiInstitutionRolesFor(can)` to the app's `launch-context.ts`; `can` judges the organization through the person's membership there. The template's answer sends Administrator to whoever may update the organization and Member to anyone else.
8. Where `ltiContextTypes` names no context for a channel type that holds tabs, such as a course section below a course, either make that type a context in `launch-context.ts`, or switch those tabs off with the statement in `data.sql`: they stop launching and no longer let the LTI tool read the course above, and a channel's Tabs card lists none.
9. Where app code calls `placementContext` or `findLtiPlacements`, call `linkContext` with the resource link: there is no walk to a channel above. Drop app code that reads `context` of a listed LTI tab or of an installation's tab, the error type `lti_context_update_required` and the texts `confirm.add_lti_tab_above`, `lti_tab_context_*` and `lti_tab_reads.text`.
10. Where app code or seeds approve an LTI tool (`approveLtiInstallation`, the query or the route), pass `channelTypes`; `updateLtiInstallationScopes` is `updateLtiInstallationGrant`, which also takes `channelTypes`. A tab in a type taken away, in a channel that is archived or of a disabled LTI tool stays as it is and does not open: every use asks `ltiTabClosure`, and app code that lists, starts or binds tabs asks it too.
11. Where app code calls `ltiRolesIn`, pass the person's id and their membership row in the channel in place of an access; a launch's roles come from `ltiLaunchRoles`, which also sends institution roles; `ltiInstitutionRolesIn` is gone; `readAsLauncher` answers the person's `memberships` in place of `access`.
12. Where app code calls `countLtiImportsSince`, drop it: a connection's hourly budgets of courses and people live in the rate limit store (`takeFromImportBudget`), counted as each import starts and each page is read; a connection imports at most `maxCoursesPerHour` (150) courses and `maxPeoplePerHour` people an hour.
13. Where the app's `appError.json` overrides `lti_context_not_set_up` or `lti_launch_no_roles`, check its text against the new meaning, and add `lti_launch_no_context` and `lti_channel_type_not_allowed` where it translates errors.
14. Where app code or a client calls `rejectLtiInstallation` (`POST lti-installations/{ltiInstallationId}/~reject`), call `deleteLtiInstallation`, which deletes an LTI tool in any state, a waiting one included; `rejectLtiInstallationOp` and `useRejectLtiInstallationMutation` are gone.
15. Where the app sets its own `clientCacheVersion`, raise it.

## Verify

```sh
pnpm generate --hints "$(cat cella/alignments/20261119T2050-lti-tab-audience/hints.json)"
pnpm check
```
