---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: ltiRolesFor, ltiInstitutionRolesFor, ltiRolesIn, ltiContextChannelType, ltiContextRole, createLtiContextChannel, LtiContextChannelFacts, planLtiContextChannel, lti_context_not_set_up, lti_launch_no_roles
---

# LTI tabs and audiences

As an LTI tool, `ltiContextChannelType` in the app's `lti-context-channel.ts` is a function of the launch's context
that answers a channel type or null, `createLtiContextChannel` reads the type it creates from `channelType`, and
`ltiContextRole` may answer null, which refuses a launch and leaves a person out of an import. A launch without a
context, or with a context of no LIS course or group type, signs in only a person the tenant knows as a member. As a
platform, the `can` that `ltiRolesFor` in `launch-context.ts` reads is judged for the person's membership in the
context channel alone, and the new `ltiInstitutionRolesFor` maps their organization membership to institution roles.

## What & why

Two runs of one app inside another showed a platform's organization tab admitting everyone into the LTI tool's
organization. A launch without a course now admits nobody new (`signInKnownLtiMember`), a context's type list decides
whether it counts, and an app maps a course and a group to different channel types. A platform sent Instructor to
every organization admin, also where they were a student: a context role now comes from the membership there.

## Blast radius

Every app that is an LTI tool: its `lti-context-channel.ts` stops compiling until the constant is a function. A launch
without a course no longer adds a member. As a platform, a person with power from above and no membership in the
context gets no context role, and every launch carries institution roles.

## Run

No script: manual.

## Manual steps

1. In the app's `lti-context-channel.ts`, make `ltiContextChannelType` a function `(context: LtiContext) => ChannelEntityType | null`: null for a context the app does not take, such as Canvas's `Account` and `User` contexts (`isLisContextType`); its `types` arrive as full URIs.
2. In `createLtiContextChannel`, create a channel of the `channelType` it is handed.
3. Make `ltiContextRole` answer null where the app gives no role, such as for institution roles alone (`isLisContextRole`): the launch is refused with `lti_launch_no_roles`, and an import leaves the person out.
4. Where app code or tests call `planLtiContextChannel`, pass the `channelType` the context maps to.
5. In the app's `launch-context.ts`, check that `ltiRolesFor` still answers what the app means now that `can` sees one membership: power inherited from a channel above, such as an organization admin's over a course, no longer makes an Instructor.
6. Add `ltiInstitutionRolesFor(can)` to the app's `launch-context.ts`; `can` judges the organization through the person's membership there. The template's answer sends Administrator to whoever may update the organization and Member to anyone else.
7. Where app code calls `ltiRolesIn`, pass the person's id and their membership row in the channel in place of an access; `readAsLauncher` answers the person's `memberships` in place of `access`.

## Verify

```sh
pnpm check
```
