# Nullable store user and TreeItem-constrained tree rows

## What & why

`useUserStore().user` is `MeUser | null`: `frontend/src/modules/user/user-store.ts` seeded it with
`null as unknown as MeUser` (36 unguarded upstream reads threw while signed out: before sign-in,
after `teardownUserState(false)`, on public routes). Authenticated code
uses `useCurrentUser(): MeUser` (components) or `getCurrentUser(): MeUser` (imperative); both throw
while signed out. `useTreeRows` requires `T extends TreeItem`; `buildTree`
(`frontend/src/modules/common/data-table/tree/build-tree.ts`) is overloaded so a non-`TreeItem` row
must supply `getId`, `getParentId`, `getDisplayOrder` (no more silently flat trees). Also:
`getEntityPolicies` / `getPolicyPermissions` take `string`; `actorFrom` / `accessFrom` take a
structural `AccessContext`; `actorFrom` returns `{ anonymous: true }` without a `userId`.

## Blast radius

Sync-breaking at the type level; no wire-shape change, no `clientCacheVersion` bump, no database
change. Affected if the app reads `useUserStore().user` (almost certainly) or calls `useTreeRows`
with rows lacking `id`/`parentId`/`displayOrder`. `pnpm check` lists every unguarded read.

## Run

No script; scope with:

```sh
grep -rn "useUserStore" --include="*.ts" --include="*.tsx" frontend/src
grep -rn "useTreeRows\|buildTree" --include="*.ts" --include="*.tsx" frontend/src
```

## Manual steps

1. Run `pnpm check` and collect the `'user' is possibly 'null'` errors.
2. Authenticated-route code: components replace `const { user } = useUserStore()` (or
   `useUserStore((s) => s.user)`) with `const user = useCurrentUser()`; imperative code replaces
   `useUserStore.getState().user` with `getCurrentUser()`. Public routes, sign-out paths, and store
   subscribers keep `useUserStore().user` and handle `null` (upstream: `unsubscribed-page.tsx`, the
   Gleap subscriber).
3. Import `useCurrentUser` / `getCurrentUser` from `~/modules/user/user-store`; drop unreferenced
   `useUserStore` imports.
4. `useUserStore.setState({ user: ... })` for a signed-out state passes `null` (no
   `as unknown as MeUser` cast).
5. For each `useTreeRows<T>` call, confirm `T` has `id: string`, `parentId: string | null`, and
   `displayOrder: number`; otherwise add the fields or call `buildTree` directly with `getId`,
   `getParentId`, `getDisplayOrder`.
6. Delete app-defined default accessors that cast to `TreeItem`; import `treeItemAccessors` from
   `~/modules/common/data-table/tree/build-tree`.

## Verify

```sh
pnpm check
pnpm test --filter frontend
```

Then load a public route, sign out and back in: a missed `useCurrentUser()` throws
`[userStore] Read the signed-in user while signed out`, naming the file in the stack trace.
