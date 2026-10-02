---
syncBreaking: false
clientCacheBump: false
---

# Onboarding picks its steps from the user's invitations

Onboarding no longer sends an invited user through the create-organization steps. getOnboardingSteps
takes { hasOrganizations, hasInvitations } and every step has a when: a user with pending
invitations gets an invitations step (explicit accept or reject per invitation) and the profile
step, a user with neither organizations nor invitations keeps the three founder steps, a member gets
profile only. The /welcome route loads both queries before the step list locks, the footer reads
currentStep from the stepper, and the completed screen links into the first organization or offers
the menu's organization createAction. Apps that never edited frontend/src/modules/home/onboarding
are unaffected; apps with their own steps add a when to each and pass the context.

## What & why

`getOnboardingSteps(ctx)` in `frontend/src/modules/home/onboarding/onboarding-config.ts` now takes
`{ hasOrganizations, hasInvitations }` and each step carries a `when`. An invited user gets a new
`invitations` step (`invitations-step.tsx`) plus `profile`, and no longer the create-organization
steps. The `/welcome` route loads organizations and invitations first, and `footer.tsx` reads
`currentStep` from the stepper. The completed screen links into the first organization, or offers
`menuSectionsSchema.organization.createAction` when there is none.

## Blast radius

Frontend only, not sync-breaking, no DB or cache change. An app that never edited
`frontend/src/modules/home/onboarding/` is unaffected. An app with its own steps gets merge
conflicts there and a type error on `getOnboardingSteps()` without arguments.

## Run

No script: manual.

## Manual steps

1. Own steps in `onboarding-config.ts`: keep them, give each a `when` (`() => true` to always show).
2. Own branches in `steps.tsx`: keep them next to the new `id === 'invitations'` branch.
3. Any call to `getOnboardingSteps()`: pass the context, or read `currentStep` from `useStepper()`.
4. Apps without organization creation: drop `createAction` in `frontend/src/menu-config.tsx` to hide the completed screen's create button.

## Verify

```sh
pnpm check
pnpm --filter frontend exec vitest run src/modules/home/onboarding
```
