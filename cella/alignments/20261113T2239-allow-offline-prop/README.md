---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: onlineOnly, allowOfflineDelete, callbackFirst
---

# One prop lets a confirmation act offline

`DeleteItems` loses `onlineOnly` and `callbackFirst`, and `DeleteForm` and `SubmitButton` rename `allowOfflineDelete`
to `allowOffline`, the name `ConfirmForm` and `openConfirm` already use. An app's own delete forms, such as copies of
`delete-users.tsx`, drop the two props and rename the third.

## What & why

Four names said whether a press may act offline. A `DeleteItems` without `optimistic` already refuses an offline
press in every `ConfirmForm` path (buttons, menu and drawer), so `onlineOnly` repeated it. `callbackFirst` had one
caller, the users delete, whose callback clears a selection; it now clears after the dialog closes, as the requests
delete always did.

## Blast radius

An app with its own `DeleteItems` callers, or a `DeleteForm` or `SubmitButton` that passes `allowOfflineDelete`: the
compiler flags each. No wire, cache or schema change.

## Run

No script: manual.

## Manual steps

1. Drop `onlineOnly` from every `DeleteItems`: one without `optimistic` refuses an offline press already.
2. Drop `callbackFirst`; a callback that must run before the dialog closes moves into the mutation's `onSuccess`.
3. Rename `allowOfflineDelete` to `allowOffline` on `DeleteForm` and `SubmitButton`, in stories and test mocks too.

## Verify

```sh
pnpm check
```
