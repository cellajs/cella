---
syncBreaking: true
clientCacheBump: false
---

# Auth step-up and devices move to queries and operations

The step-up and device code follows the backend layering. readStepUp and requireStepUp move from
step-up/helpers/step-up to step-up/operations/read-step-up; openStepUpLink from
step-up/helpers/step-up-link to step-up/operations/open-step-up-link; stampStepUp(sessionId, userId,
via) becomes the query updateSessionSteppedUp(ctx, { id, userId, via }) in sessions/sessions-queries.
The device table, enrollDevice, notifySignIn, notifyNewSignIn, isRecognizedBrowser and pruneDevices
move into a new auth/devices folder; strategyLabels moves to general/helpers/strategy-labels. Apps
update imports and vi.mock paths.

## What & why

Reads and writes are queries, everything else an operation. `refuseImpersonation`, `stepUpMethods` and `stepUpWindow` stay in `step-up/helpers/step-up`. `devices-db` moves to `auth/devices/devices-db`; its reads and writes live in `auth/devices/devices-queries`. `enrollDevice`, `notifySignIn`, `isRecognizedBrowser` and `pruneDevices` move from `general/helpers` and `jobs` to `auth/devices/operations/`.

## Blast radius

Apps that import these paths, mock them in tests or call `stampStepUp`; TypeScript reports each import. No database change, no `clientCacheVersion` bump. An app that never touched auth internals is unaffected.

## Run

No script: manual.

## Manual steps

1. `readStepUp`, `requireStepUp`: `step-up/helpers/step-up` → `step-up/operations/read-step-up`. `openStepUpLink`: `step-up/helpers/step-up-link` → `step-up/operations/open-step-up-link`.
2. `stampStepUp(sessionId, userId, via)` becomes `updateSessionSteppedUp(ctx, { id: sessionId, userId, via })` from `sessions/sessions-queries`; it returns the stamped row or undefined.
3. `auth/devices-db` → `auth/devices/devices-db`; `general/helpers/{enroll-device,notify-sign-in,recognized-browser}` and `jobs/prune-devices` → `auth/devices/operations/` under the same file names.
4. `strategyLabels`: `general/helpers/notify-sign-in` → `general/helpers/strategy-labels`.
5. Update `vi.mock` paths in your tests the same way.

## Verify

```sh
pnpm check
```
