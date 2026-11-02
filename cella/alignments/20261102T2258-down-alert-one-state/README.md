---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: maintenance, maintenance_mode, auth_unavailable, AlertKey, offlineAlertShown, setDownAlert, on-success, clientConfig, apiErrorFromResponse, alertVariants
---

# The down alert is one state, raised by the API client

The API client now raises and clears the down alert for every request, so `appConfig.maintenance`, the `auth_unavailable` alert and `Alert`'s `soft` prop are gone. Remove them from app code.

## What & why

Only the query and mutation caches raised the alert, so a direct SDK call such as sign-out failed with no reason shown, and any query that succeeded cleared it, even one reading a static file. `apiFetch` in `frontend/src/lib/api-client.ts` now sees every answer: a `service_unavailable` error raises the alert and an answer below 500 clears it. A 504 now raises it too, and an API 503 of another type no longer does.

With that, the store holds one boolean. `appConfig.maintenance` only lasted until the first answer, a 500 from `/me` is an ordinary error toast with its request id, and the alert says what is known ("Server unavailable") in place of "undergoing maintenance". Nothing used `Alert`'s solid form outside a story.

## Blast radius

App code that reads the alert store, reads the removed exports, passes `soft` or the removed variants to `Alert`, or sets `maintenance` in `shared/config`. No database or cache change. A banner now also hides as soon as the app goes offline, about two seconds before the offline alert shows, and stays hidden after that alert is dismissed.

## Run

No script: manual.

## Manual steps

1. Remove `maintenance` from `shared/config/config.*.ts`.
2. On `Alert` and `AlertBanner`, remove `soft`. Replace `variant="brand"` and `variant="secondary"` with another variant or a `default` alert with its own classes.
3. Replace `alertVariants` with `ComponentProps<typeof Alert>['variant']`.
4. In the alert store, `downAlert` is a boolean: call `setDownAlert(true)` or `setDownAlert(false)`. Replace `AlertKey` with that boolean, and `offlineAlertShown` with `useOnlineManager()`.
5. Replace `clientConfig.fetch` with `apiFetch` from `~/lib/api-client`, which throws a failed response as an `ApiError`, so `apiErrorFromResponse` has no caller left. Remove imports of `~/query/on-success`.
6. Remove app translations of `c:maintenance_mode` and `c:auth_unavailable`, with their `.text` keys. An override of `c:server_unreachable` now also shows in the floating alert.

## Verify

```sh
pnpm check
```

With the backend stopped, open `/auth/sign-out` and `/docs`: both show the floating alert.
