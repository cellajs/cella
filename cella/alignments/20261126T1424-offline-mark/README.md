---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: offline.alert, useOfflineAlert, use-offline-alert
---

# Offline is a mark on the menu button: the `offline.alert` key is gone

An app that overrides `offline.alert` in `locales/*/app.json` moves its wording to `offline_mode`, `offline_mode.text`
and `offline_mode.summary`. App code that imports `useOfflineAlert` reads `useOfflineMark` from
`~/modules/navigation/use-offline-mark`, and a `FloatingNavButton` given children takes `mark`.

## What & why

`DownAlert` shows the server's down alert alone. Offline is a cloud-off mark on the menu nav button (`OfflineNavMark`,
the menu item's `mark`), a line in the menu sheet (`OfflineMenuAlert`) and a one-time explainer in the app layout
(`OfflineExplainer`, seen as `offline_mode`). The floating alert showed on every short network gap, so the mark waits
2 s offline and 10 s after a resume, with no probe.

## Blast radius

Apps that override `offline.alert`, import `useOfflineAlert` or pass children to `FloatingNavButton`; any other app
gets the change for free. Public and embed layouts show no offline UI. No database, cache or lens change.

## Run

No script: manual.

## Manual steps

1. Not caught by the compiler. `locales/*/app.json`: replace an `offline.alert` override with `offline_mode` (the explainer's title), `offline_mode.text` (its text) and `offline_mode.summary` (the menu line).
2. The typecheck flags an import of `~/modules/common/alerter/use-offline-alert`: read the boolean `useOfflineMark()` from `~/modules/navigation/use-offline-mark`.
3. The typecheck flags children passed to `FloatingNavButton`: pass them as `mark`.

## Verify

```sh
git grep -n -e offline.alert -e useOfflineAlert
pnpm check
```

By hand: a signed-in tab offline for 2 s shows the mark on the menu button, the line in the menu sheet and, once per
device, the explainer.
