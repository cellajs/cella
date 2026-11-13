---
breaking: false
clientCacheBump: false
grep: SidebarOrganizationButtons, home.sections, lazyNamed
---

# An organizations page behind the rail's last button; the home page renders whole

The organization rail ends in a `…` button that opens `/organizations` (`OrganizationsPage`), the menu's organization section in the home page's column, with its create, hide and reorder flow. The home route gets `homeLoader`, which awaits each `home.sections` tool's new `preload`, so the page paints complete. Home, organizations and lobby share `CenteredPage` with the `page-enter` fade. A pinned nav sheet now wraps Tab at both ends.

## What & why

The rail's dashed create button gave no way to hide, reorder or reach hidden organizations. `MenuSheetSection` takes `surface="page"`, `emptyState` and `rowCounts`; `NoOrganizationAlert` moves out of `home-page.tsx`. `openOrganizationLobby` also leaves the organizations page. A lazy home section suspended once, and React held its reveal for 300ms: `preloadableNamed` renders a preloaded component without suspending. `SidebarOrganizationButtons` takes `onNavItemClick`.

## Blast radius

Apps with `navigation.menu: 'perOrganization'` see the new rail button and page. An app with its own `home.sections` tool keeps the late landing until the tool preloads. Apps rendering `SidebarOrganizationButtons` themselves get a type error. No wire, cache or schema change.

## Run

No script: manual.

## Manual steps

1. Give each app `home.sections` tool a `preload` that loads its code and data; build its lazy component with `preloadableNamed` and call its `preload` there.
2. Add the `organizations` key to each non-English `common.json`.
3. Where an app renders `SidebarOrganizationButtons`, pass the nav item trigger as `onNavItemClick`.

## Verify

Open `/home` by reload and by the rail's app mark: nothing moves after the first paint but the 4px rise. Then `pnpm check`.
