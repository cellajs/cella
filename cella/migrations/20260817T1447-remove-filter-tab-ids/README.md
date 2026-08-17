# Remove the filterTabIds allow-list from nav tabs

## What & why

The `filterTabIds` prop is deleted from `PageTabNav` and `ResolveNavTabsOptions`
(`frontend/src/modules/common/page/tab-nav.tsx`). It was an imperative per-call-site
allow-list with zero template consumers, its own docs pointed at the declarative
alternative (`grants` + `navTab.requires`, plus `visibleTo` pairs for registry tabs), and it
was invisible to `guardNavTabs`/`useNavTabRedirect`: allow-list-hidden tabs stayed reachable
by URL and could be picked as the landing tab. The declarative gates flow through the
placement machinery the guards already honor, so removing the mechanism closes that hole for
free.

## Blast radius

Sync-breaking for apps that pass `filterTabIds` to `PageTabNav` or `resolveNavTabs`: the
prop no longer exists, so the app fails to compile at sync. No database or wire change, no
`clientCacheVersion` bump. Apps that never used the prop are unaffected.

## Run

No script — manual.

## Manual steps

1. Find call sites: `grep -rn "filterTabIds" frontend/src`.
2. Express each gate declaratively BEFORE syncing, or the previously hidden tabs reappear:
   - Permission gates: declare `requires: '<action>'` on the route's `staticData.navTab`
     and pass the actor's `grants` to `PageTabNav` (and to the route's `guardNavTabs`).
   - Role gates on registry tabs: declare `visibleTo: ['<channel>.<role>']` and pass `pairs`.
   - Hard feature removal: drop the tab's route file or registry declaration, or hide it via
     `placementOverrides` in the pinned `frontend/src/placement-config.ts`.
3. Delete the `filterTabIds` props from the call sites.

## Verify

`pnpm check` passes; navigating directly to a previously allow-list-hidden tab URL now
either resolves (gate expressed declaratively and held) or forwards to the landing tab.
