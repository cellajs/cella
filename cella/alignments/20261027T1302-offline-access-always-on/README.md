---
syncBreaking: true
clientCacheBump: false
caughtBy: compiler
grep: includeMemberQueries, offlineAccess, offline_access
---

# Offline access is always on

Remove `includeMemberQueries` from the app-owned `frontend/src/entity-sync-queries.ts`: its member queries are always
added. App code that reads `offlineAccess`, `toggleOfflineAccess` or the ui-store `reset`, renders `OfflineAccessSwitch`
or passes `offlineAccess` to `NavSheetRow` drops it.

## What & why

The offline access switch is gone. Every user gets the persisted `rq` cache, and the background fill seeds every
organization the user belongs to, members included. The switch protected nothing: the cache was in IndexedDB either
way, and sign-out deletes it. Its session mode lost writes queued in a closed tab. The `offline_access*` locale keys
are removed and the offline down alert reads `offline.alert`.

## Blast radius

Every app: the pinned `entity-sync-queries.ts` fails typecheck until step 1. No database, lens or
`clientCacheVersion` change. The background fill now runs for every user, so every list the app's
`entity-sync-queries.ts` returns is fetched once per device.

## Run

No script: manual.

## Manual steps

1. `frontend/src/entity-sync-queries.ts`: drop `includeMemberQueries` from the parameters and the `if` around the `membersListQueryOptions` push.
2. Remove what typecheck flags of `offlineAccess`, `toggleOfflineAccess`, `uiStore.getState().reset` and `OfflineAccessSwitch` in app code.
3. Remove `offline_access*` overrides from `locales/*/app.json`; override `offline.alert` instead.
4. Check that each list `entity-sync-queries.ts` returns is worth fetching for every organization of every user.

## Verify

```sh
pnpm check
```
