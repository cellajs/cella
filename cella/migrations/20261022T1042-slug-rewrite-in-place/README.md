---
syncBreaking: true
clientCacheBump: false
---

# A slug rewrite keeps the route below it; resolveChannelBySlug drops routeTo

`resolveChannelBySlug` no longer takes `routeTo`: `rewriteUrlToSlug` redirects to the route being entered, so the
organization layout's rewrite keeps a channel page below it. Delete the `routeTo` line from each call in an app's
`route-logic.ts`. `getNotificationRoute` (`~/modules/notification/notification-link`) is gone: `getProductRoute` in
`~/utils/channel-route` replaces it and lands a cached subitem on its parent's page.

## What & why

A route param may carry an id that `beforeLoad` rewrites to the slug. The organization layout redirected to its own
path for that and dropped the child route with its search, so a notification link to a channel below the organization
landed on the organization page. `rewriteUrlToSlug` now redirects to `'.'`, the pending leaf route, params, search and
hash kept. A link may therefore carry ids in every param; `channel-route.ts` no longer reads the organization slug from cache.

## Blast radius

Typecheck fails in an app's `route-logic.ts` that passes `routeTo`, and in a file that imports `getNotificationRoute`.
An app with no channel below the organization is otherwise unaffected. No database or cache change.

## Run

No script: manual.

## Manual steps

1. Delete the `routeTo:` line from each `resolveChannelBySlug` call in `frontend/src/modules/<channel>/route-logic.ts`.
2. Replace `getNotificationRoute(row)` from `~/modules/notification/notification-link` with `getProductRoute(row)` from `~/utils/channel-route`; an app's own link resolver (a share link route) can call it too.
3. Drop an app's own cache lookup of the organization slug for a route param: the id in `organizationSlug` is rewritten.

## Verify

```sh
pnpm check
```
