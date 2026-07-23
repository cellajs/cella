# Nullable store user and TreeItem-constrained tree rows

## What & why

Two upstream types asserted a shape that nothing verified, so code that broke them still compiled.
Both now state what they actually hold.

**`useUserStore().user` is `MeUser | null`.** It was typed `MeUser` and seeded with
`null as unknown as MeUser` in `frontend/src/modules/user/user-store.ts`, so every read compiled
while the field is genuinely null: at rest before sign-in, after a soft session loss
(`teardownUserState(false)`), and on every public route. Typing it honestly surfaced 36 unguarded
reads across 20 files upstream, each a `TypeError` on any path reachable while signed out. Two
accessors carry the authenticated-route requirement instead:

- `useCurrentUser(): MeUser` for components mounted under an authenticated route.
- `getCurrentUser(): MeUser` for imperative code in authenticated flows.

Both throw while signed out, naming the requirement at the read.

**`useTreeRows` requires `T extends TreeItem`.** Its accessors (`getId`, `getParentId`,
`getDisplayOrder`) are all optional and fall back to `TreeItem`'s field names, which
`frontend/src/modules/common/data-table/tree/build-tree.ts` read through
`item as unknown as TreeItem`. A row without `parentId` therefore built a silently flat tree
rather than failing. `buildTree` is now overloaded: a row satisfying `TreeItem` may omit the
accessors, and any other row shape must supply all three.

Also in the same sweep, with no fork action needed unless you call them directly:
`getEntityPolicies` / `getPolicyPermissions` take `string` (all four call-site casts dropped);
`actorFrom` / `accessFrom` take a structural `AccessContext`, and `actorFrom` returns
`{ anonymous: true }` for a context with no `userId` rather than a malformed `Actor`.

## Blast radius

Fork-breaking at the type level. No wire-shape change, no `clientCacheVersion` bump, no database
change.

A fork is affected if it reads `useUserStore().user` (almost certainly: any account, profile,
onboarding, or navigation component), or calls `useTreeRows` with a row type lacking
`id`/`parentId`/`displayOrder`. A fork that never uses the tree data table is unaffected by the
second change.

The user-store change is compile-time-detected: `pnpm check` lists every unguarded read, so there
is no silent-breakage risk. Work the error list top to bottom.

## Run

No script. The compiler enumerates the work; these greps scope it first.

```sh
grep -rn "useUserStore" --include="*.ts" --include="*.tsx" frontend/src
grep -rn "useTreeRows\|buildTree" --include="*.ts" --include="*.tsx" frontend/src
```

## Manual steps

1. Run `pnpm check` and collect the `'user' is possibly 'null'` errors.
2. For each, decide whether the code runs only under an authenticated route:
   - Yes, and it is a component: replace `const { user } = useUserStore()` (or
     `useUserStore((s) => s.user)`) with `const user = useCurrentUser()`.
   - Yes, and it is imperative code: replace `useUserStore.getState().user` with
     `getCurrentUser()`.
   - No (public routes, sign-out paths, store subscribers): keep `useUserStore().user` and handle
     `null` explicitly. Upstream examples are `unsubscribed-page.tsx` and the Gleap subscriber.
3. Update the import on each touched file: `useCurrentUser` / `getCurrentUser` come from
   `~/modules/user/user-store`. Drop `useUserStore` where it is no longer referenced.
4. If a fork calls `useUserStore.setState({ user: ... })` for a signed-out state, pass `null`
   directly; the `as unknown as MeUser` cast is no longer needed.
5. For each `useTreeRows<T>` call, confirm `T` has `id: string`, `parentId: string | null`, and
   `displayOrder: number`. If it does not, either add those fields, or call `buildTree` directly
   and pass all three accessors (`getId`, `getParentId`, `getDisplayOrder`).
6. If a fork defined its own default accessors by casting to `TreeItem`, delete them and import
   `treeItemAccessors` from `~/modules/common/data-table/tree/build-tree`.

## Verify

```sh
pnpm check
pnpm test --filter frontend
```

Then exercise a signed-out path in the running app (load a public route, sign out and back in).
A missed `useCurrentUser()` in code reachable while signed out throws with
`[userStore] Read the signed-in user while signed out`, which names the file in the stack trace.
