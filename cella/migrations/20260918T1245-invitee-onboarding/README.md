# Onboarding picks its steps from the user's invitations

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
