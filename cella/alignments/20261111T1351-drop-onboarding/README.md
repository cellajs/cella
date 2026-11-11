---
breaking: true
clientCacheBump: true
caughtBy: compiler
grep: finishedOnboarding, welcomeRedirectPath, skipWelcome, useStepper, Stepper, TextEffect, useUpdateSelfFlagsMutation, resetSections, booleanSearchParam, finishOnboarding, onboarding_
---

# The onboarding flow is gone

The template no longer ships `/welcome`, the stepper, the completed screen, the `finishedOnboarding` flag or
`welcomeRedirectPath`: a new user lands on `/home`, whose alert rows prompt for a first organization and answer
invitations. An app drops its own uses of the flag, of `Stepper`, `useStepper`, `TextEffect`, `useUpdateSelfFlagsMutation`,
`resetSections` and `booleanSearchParam`, and of the `compact`, `onboarding` and `children` props of `UpdateUserForm`,
`CreateOrganizationForm` and `InviteUsers`. A first run of the app's own is a `home.sections` tool.

## What & why

Home already shows the create-organization prompt and the pending-invitation rows, so the stepper duplicated them and
for most users shrank to one profile step behind a full-screen dialog; apps build their own first run in their own
style. Removed: `frontend/src/modules/home/onboarding`, `welcome-page.tsx`, `route-logic.ts`, `common/stepper`,
`common/text-effect.tsx`, the `skipWelcome` search param, `useUpdateSelfFlagsMutation`, `canvas-confetti`, 19 `c:` keys
and the server's welcome redirect.

## Blast radius

Breaking for an app that imports a removed module or sets `finishedOnboarding` (a seed, a demo's `create-demo`):
typecheck fails there. `defaultUserFlags` is `{}`; a stored `finishedOnboarding` is ignored, and `/me` still returns it
until the optional SQL below runs. `userFlags` lost a required property on the wire, so `clientCacheVersion` is bumped;
no lens. An app that never touched onboarding gets the change for free.

## Run

No script: manual.

## Manual steps

1. Remove the app's imports of `Stepper`, `useStepper`, `TextEffect`, `useUpdateSelfFlagsMutation`, `resetSections`, `booleanSearchParam` and `welcomeRedirectPath`, and the `compact`, `onboarding` and `children` props it passes to `UpdateUserForm`, `CreateOrganizationForm` or `InviteUsers`.
2. Drop `userFlags: { finishedOnboarding: true }` from app seeds and demo creation (`create-demo.ts`), and `finishedOnboarding` from a `defaultUserFlags` override in the app config.
3. Drop overrides of the removed keys from `locales/*/app.json`: `onboarding_*`, `skip_org_creation*`, `tune_profile`, `get_started`, `invite_others`, `welcome`, `skip`, `need_org_to_invite.text`, `no_invitations_left.text`, `already_created_org.text`.
4. Drivers and skills that patched `/me` with `finishedOnboarding` drop that call.
5. Optional cleanup of live rows: `UPDATE users SET user_flags = user_flags - 'finishedOnboarding';`.
6. A first run of the app's own becomes a `home.sections` tool, with any flag it needs declared in `defaultUserFlags`.

## Verify

```sh
pnpm check
pnpm cella i18n unused
```
