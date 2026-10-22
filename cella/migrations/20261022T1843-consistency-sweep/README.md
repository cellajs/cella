---
syncBreaking: false
clientCacheBump: false
---

# The frontend's synced files were swept for consistency; app-owned files can get the same review

The template reviewed its frontend module by module (navigation first, then the `common/` folders) for readability,
one way of doing one thing, and fewer lines, and the result arrives through the sync. Nothing here breaks an app. The
app's own files still carry the old patterns; the synced `consistency-sweep` skill (`cella/skills/consistency-sweep/`)
runs the same review over them, one module at a time, with an agent per pass and a proof for every class change.

## What & why

The conventions the sweep applied, now expected everywhere: camelCase module constants; a store alias outside hooks
(`sheeter.getState()`, `uiStore`); `toastOffline()` for an offline refusal; `onX` callback props; `~/` imports and no
barrels; `interface XProps`; `cn()` only for a merge or a conditional; one styling mechanism per state; no
`aria-hidden` on lucide icons; comments at budget. The sweep also found bugs the apps inherit through the sync (an
inverted `slashMenu` flag, a filter bar split at the wrong breakpoint, a `memo` the recursion skipped).

## Blast radius

Nothing to change for the sync itself. An app that wants the same quality in its own modules runs the skill; an app
that does not keeps working. No database, wire or cache change.

## Run

No script: manual.

## Manual steps

1. Read `cella/skills/consistency-sweep/SKILL.md`; pick one app-owned module of 2,000 to 5,000 lines.
2. Run the scout (`scout.md`) over it, decide its leads, write the group brief from `brief.md`, then the five passes of `passes.md`, one agent and one commit each; `tw-check.mjs` proves every class change.
3. Repeat per module; keep the per-pass reports beside the PR.

## Verify

```sh
pnpm check
pnpm style
pnpm unused
```
