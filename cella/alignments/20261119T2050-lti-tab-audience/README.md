---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: ltiContextChannelType, ltiContextRole, createLtiContextChannel, LtiContextChannelFacts, planLtiContextChannel, lti_context_not_set_up, lti_launch_no_roles
---

# LTI tabs and audiences

As an LTI tool, `ltiContextChannelType` in the app's `lti-context-channel.ts` is a function of the launch's context
that answers a channel type or null, `createLtiContextChannel` reads the type it creates from `channelType`, and
`ltiContextRole` may answer null, which refuses a launch and leaves a person out of an import. A launch without a
context, or with a context of no LIS course or group type, signs in only a person the tenant knows as a member.

## What & why

Two runs of one app inside another showed a platform's organization tab admitting everyone into the LTI tool's
organization. A launch without a course now admits nobody new (`signInKnownLtiMember`), a context's type list decides
whether it counts, and an app maps a course and a group to different channel types.

## Blast radius

Every app that is an LTI tool: its `lti-context-channel.ts` stops compiling until the constant is a function. A launch
without a course no longer adds a member.

## Run

No script: manual.

## Manual steps

1. In the app's `lti-context-channel.ts`, make `ltiContextChannelType` a function `(context: LtiContext) => ChannelEntityType | null`: null for a context the app does not take, such as Canvas's `Account` and `User` contexts (`isLisContextType`); its `types` arrive as full URIs.
2. In `createLtiContextChannel`, create a channel of the `channelType` it is handed.
3. Make `ltiContextRole` answer null where the app gives no role, such as for institution roles alone (`isLisContextRole`): the launch is refused with `lti_launch_no_roles`, and an import leaves the person out.
4. Where app code or tests call `planLtiContextChannel`, pass the `channelType` the context maps to.

## Verify

```sh
pnpm check
```
