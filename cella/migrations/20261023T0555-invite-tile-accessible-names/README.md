---
syncBreaking: true
clientCacheBump: false
---

# The invite tiles are named by their visible text

The invite dialog's two start tiles have no `aria-label`: their translated text names them. An app's pinned
`a11y/scope-config.ts` that clicks the tile by `{ name: 'Add by email' }` clicks it by `{ name: /invite with email/i }`.

## What & why

`frontend/src/modules/user/invite-users.tsx` gave the two `ToggleGroupItem` tiles the hardcoded English `aria-label`s
"Add by email" and "Search users". They replaced the translated visible text as the accessible name, so a Dutch screen
reader heard English. Each tile is now named by its own text ("Invite with email addresses").

## Blast radius

Sync-breaking only for an app that pins `a11y/scope-config.ts` (raak and projectcampus do): its `invite-dialog` state
no longer finds the tile, so the accessibility audit fails there. No database, cache or rendering change.

## Run

No script: manual.

## Manual steps

1. In `a11y/scope-config.ts`, state `invite-dialog`: replace `page.getByRole('button', { name: 'Add by email' })` with `page.getByRole('button', { name: /invite with email/i })` (raak line 145, projectcampus line 194).

## Verify

```sh
pnpm a11y
pnpm check
```
