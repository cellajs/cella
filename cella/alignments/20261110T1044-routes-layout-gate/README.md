---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: isAuth, createErrorComponent, createNotFoundComponent, SpinnerPage, _content, routes/types, onEnter
roots: frontend/src
---

# The app layout gates sign-in, and the router's defaults render errors and pending loads

Drop `isAuth` from every route's `staticData` (the `_app` layout's `beforeLoad` is the gate; a protected page under `_public` calls
`requireSession` from `modules/auth/route-logic.ts`), drop `errorComponent: createErrorComponent(…)` and
`notFoundComponent: createNotFoundComponent(…)` from route files (the router's `defaultErrorComponent` and
`defaultNotFoundComponent` read the layouts from `staticData.boundary`), move route files out of `routes/_public/_content/`
into `routes/_public/`, call `requireEntityAction` without its redirect path, and import `PageSpinner` and `withSuspense` from
`modules/common` and `BoundaryType` from `lib/boundary`.

## What & why

The root `beforeLoad` and the `isAuth` flag are gone: the folder already said which pages need a session, and
`appLayoutBeforeLoad` (`modules/common/app/route-logic.ts`) is now the one gate. `router.ts` sets `defaultErrorComponent`,
`defaultNotFoundComponent` and `defaultPendingComponent`, so route files declare none; `staticData.errorHome` names a
section's home. `SpinnerPage` and `withSuspense` left `routes/` for `modules/common`, `BoundaryType` for `lib/boundary`. The onboarding
redirects run in `beforeLoad`, and `_public/_content/route.tsx` is gone.

## Blast radius

Every app: each app-owned route file declares `isAuth`, which the compiler now refuses, and the marketing routes are
app-owned too. An app that hooked the root `beforeLoad` (a public fallback) moves the hook into `requireSession`. No
wire, cache or schema change.

## Run

```sh
pnpm cella align --run 20261110T1044-routes-layout-gate                          # report only
pnpm cella align --run 20261110T1044-routes-layout-gate -- rewrite frontend/src   # apply
```

## Manual steps

1. `git mv frontend/src/routes/_public/_content/<file> frontend/src/routes/_public/<file>` for each app route under `_content/`, and update their route ids in `getRouteApi`, `useMatch` and `useSearch` calls.
2. Where a route's loader or page throws `notFound()`, keep `notFoundComponent: RouteNotFoundComponent` (from `~/routes/-route-utils`); drop every other `notFoundComponent` and `errorComponent` the inventory lists.
3. Drop `pendingComponent` and its local spinner from redirect-only routes (a task link, an item link): the router's default shows.
4. Turn an `onEnter` that navigates into a `beforeLoad` that throws `redirect`, in the module's `route-logic.ts`.
5. Where `__root.tsx` carried an app hook before the sign-in redirect, move it into `requireSession` in `modules/auth/route-logic.ts` and keep `__root.tsx` as the template ships it.
6. Replace `import('~/routes/router')` with `getRouter()` from `~/routes/-router-instance`.
7. Route options in one order: `staticData`, `params`, `validateSearch`, `search`, `beforeLoad`, `loaderDeps`, `loader`, `head`, then the components, `component` last.

## Verify

```sh
pnpm generate:routes
pnpm check
```
