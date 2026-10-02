---
syncBreaking: true
clientCacheBump: false
---

# Remove the filterTabIds allow-list from nav tabs

PageTabNav/resolveNavTabs lose the filterTabIds prop: an imperative allow-list with zero template
consumers that the nav-tab guards never honored, so allow-list-hidden tabs stayed URL-reachable and
could become the landing tab. Apps passing it must express each gate declaratively before syncing:
navTab.requires + grants for permission gates, visibleTo + pairs for role gates on registry tabs, or
placementOverrides/route removal for hard removal. Compile error at sync until call sites are
migrated.

## What & why

The `filterTabIds` prop is deleted from `PageTabNav` and `ResolveNavTabsOptions`
(`frontend/src/modules/common/page/tab-nav.tsx`): `guardNavTabs`/`useNavTabRedirect` never
honored it, so allow-list-hidden tabs stayed URL-reachable and could become the landing tab; the
declarative gates (`grants` + `navTab.requires`, `visibleTo` pairs) go through placement, which
the guards honor.

## Blast radius

Sync-breaking for apps passing `filterTabIds` to `PageTabNav` or `resolveNavTabs`: compile error
at sync. No DB or wire change, no `clientCacheVersion` bump. Apps that never used the prop are
unaffected.

## Run

No script: manual.

## Manual steps

1. Find call sites: `grep -rn "filterTabIds" frontend/src`.
2. Express each gate declaratively BEFORE syncing, or the hidden tabs reappear: permission gates
   as `requires: '<action>'` on the route's `staticData.navTab` plus the actor's `grants` passed to
   `PageTabNav` (and the route's `guardNavTabs`); role gates on registry tabs as
   `visibleTo: ['<channel>.<role>']` plus `pairs`; hard removal by dropping the tab's route file or
   registry declaration, or `placementOverrides` in the pinned `frontend/src/placement-config.ts`.
3. Delete the `filterTabIds` props from the call sites.

## Verify

```sh
pnpm check   # then a previously hidden tab URL resolves (gate held) or forwards to the landing tab
```
