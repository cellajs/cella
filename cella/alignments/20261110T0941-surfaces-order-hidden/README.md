---
breaking: true
clientCacheBump: false
caughtBy: compiler
---

# Surfaces order and hide, and an omitted id stays

Turn each `appConfig.surfaces` list in `shared/config/config.default.ts` into `{ order, hidden }`: the list becomes
`order`, and every tab or tool the list left out, which the slot used to hide, goes into `hidden`. Type the key with
`SurfaceArrangement`. `frontend/src/main.tsx` no longer calls `assertSurfaces`.

## What & why

A listed surface was total: an id it left out vanished, and so did a tab whose id it misspelled or an upgrade renamed.
The startup check `assertSurfaces` had to catch that. Now `order` puts the ids it names first, `hidden` takes placements
off, and an unknown id is skipped. Every wrong id shows on the page. The check, `assertSurfaceIds` and `allSlots` are
removed. A tab or tool the template adds appears in an arranged slot until the app hides it.

## Blast radius

Every app: the config type changes, and typecheck fails until the key is retyped. An app with `surfaces: {}` changes
only the type. No wire, cache or schema change.

## Run

No script: manual.

## Manual steps

1. In `shared/config/config.default.ts`, import `SurfaceArrangement` from `../src/config-builder/types.ts` and type `surfaces` as `Partial<Record<SlotOf<…>, SurfaceArrangement>>`.
2. Rewrite each listed slot as `{ order: [...] }`.
3. Add to its `hidden` the `navTab` children of the slot's layout route and the tools registered for it that the list left out, as in `'organization.tabs': { order: ['members', 'settings'], hidden: ['attachments'] }`.
4. A test that calls `withSurface(slot, ids, run)` passes `{ order: ids }`.

## Verify

```sh
pnpm check
```

Then open every page whose slot the app arranges: it shows the same tabs and sections, in the same order, as before.
