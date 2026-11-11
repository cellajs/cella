---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: lastUser, deleteLocalUserDb, deleteLocalUserDbOf
---

# A browser keeps the database of the signed-in user and the last user

App code that sets `lastUser: null` and still expects a lapsed account's per-user database to stay (a
`teardownUserState(false)` before another account signs in) loses that database at the next load:
`sweepForgottenUserDbs` deletes every per-user database but those of the stored `user` and `lastUser`.
`deleteLocalUserDb` and `deleteLocalUserDbOf` are gone. `endSession` and `forgetStoredUser` keep their signatures.

## What & why

Sign-out worked through the device before it ended the session, and a database delete another tab blocked kept a tab
signed in for good. The server now ends the session first and every step on the device has a time limit. One rule
replaces the delete by id: `sweepForgottenUserDbs` (`frontend/src/utils/teardown-user-state.ts`) runs at a wipe and at
every load.

## Blast radius

An app that only calls `endSession`, `forgetStoredUser` or `teardownUserState` is unaffected. Affected: app code that
writes `lastUser` itself, and callers of the two removed deletes, which typecheck names. No wire, cache or schema
change.

## Run

No script: manual.

## Manual steps

1. Replace a `deleteLocalUserDb()` or `deleteLocalUserDbOf(id)` call with `teardownUserState(true)`, or with `sweepForgottenUserDbs()` once the user store no longer names that user.
2. For each `lastUser: null` write in app code, decide whether the account it forgets may lose its stored offline work: keep that user as `lastUser` where it may not, and correct a comment that promises the database stays.

## Verify

```sh
pnpm check
```

Read every write to `lastUser` in app code: after it, only the stored `user` keeps a database across the next load.
