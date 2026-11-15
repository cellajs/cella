---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: lastUser, isAnonymous, location.reload
---

# One function ends a session, with one row per reason

`endSession(reason, { redirect })` (`frontend/src/modules/auth/end-session.ts`) takes `'sign-out' | 'lost' |
'elsewhere' | 'expired' | 'replaced'`. `teardownUserState`, `clearUserState`, `isTearingDown`, `forgetStoredUser`,
`deletedElsewhereListeners`, `frontend/src/utils/teardown-user-state.ts` and the `fromRoot` search param are gone.
`sweepForgottenUserDbs` moved to `end-session.ts`. `endSession({ wipe })` is now `endSession('sign-out')`.

## What & why

Fourteen call sites chose by hand in which order to end the server session, drop the database, null the user and
leave the page. One function with a table now decides that. Ending a session always loads a page. A stored user stays
live until a lost session's 401, on any page. `/me` serves `session: { id, expiresAt }`, which the user store keeps.
An anonymous session's sign-out deletes its account.

## Blast radius

Breaking for app code that called the removed functions or passed `fromRoot`: typecheck names each site. App code that
works around a stale stored user, nulls `lastUser` before another sign-in or keeps its own note of a session's end
needs reading. No cache bump, no migration.

## Run

No script: manual.

## Manual steps

1. Replace `teardownUserState(true)` and `forgetStoredUser()` with `endSession('expired')`, `teardownUserState(false, leave)` with `endSession('lost', { redirect })`, and `endSession({ wipe: true })` with `endSession('sign-out')`.
2. Drop `fromRoot` from every redirect and search schema that passes it.
3. Drop a `userStore.setState({ lastUser: null })` that only kept `getAndSetMe` from reloading: it now compares against the live user.
4. Drop app code that ends a stored anonymous user before sign-in or before a demo starts: `authenticateBeforeLoad` sends that user through the sign-out page, and `TryDemoButton` shows only to a visitor.
5. Replace an app's own note of when a session ends with `userStore.getState().session.expiresAt`.
6. Name an app's `localStorage` store `${appConfig.slug}-<name>`, and list each `idbKvStorage` store in `extraLocalUserStores`.

## Verify

```sh
pnpm --filter frontend exec vitest run src/query/tests/store-lifetime.test.ts src/modules/auth/end-session.test.ts
pnpm check
```

Sign out, then revoke a session from another browser and open an app page: each loads the page the table in
`cella/CLIENT.md` names.
