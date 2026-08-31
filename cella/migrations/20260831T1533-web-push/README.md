# Web Push for notifications; Periodic Background Sync retired

## What & why

Phases 3–5 of `WEB_PUSH_BADGE_PLAN.md`. A new `push` module (backend `modules/push/`) stores
per-device Web Push subscriptions and sends one payload per fresh notification row to offline
subscribers (ids only; the service worker shows a collapsible toast and recounts the unread badge
through the API). The notifications settings card gains a per-device push toggle. The Periodic
Background Sync badge path is deleted: it never fired on Safari/iOS and Web Push is the portable
mechanism both Chrome's and WebKit's badging docs recommend.

## Blast radius

Not sync-breaking; the feature is double-gated (config `has.push`, default false, AND `VAPID_*`
env keys) so a synced app behaves exactly as before until both are set. What every app inherits
regardless: one new table (`push_subscriptions` — run `pnpm generate`), the `/push` routes in the
SDK, service-worker `push`/`notificationclick`/`pushsubscriptionchange` handlers, and the removal
of the `periodicsync` handler plus `registerPeriodicBadgeSync()` (closed-app badge updates now
arrive only via push). Apps that customized `lib/sw.ts` or `seen-tracker.tsx` merge those edits by
hand.

## Run

No script — manual.

## Manual steps

1. Sync, run `pnpm generate`, apply migrations (`push_subscriptions` plus its grants).
2. To enable push: generate a VAPID key pair (`npx web-push generate-vapid-keys`), set
   `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (and optionally `VAPID_SUBJECT`, a mailto: or URL;
   defaults to the frontend URL) in the deployment's secret manager, and flip `has.push` to true
   in `shared/config/config.default.ts`.
3. Verify on real devices before announcing: desktop Chrome and an installed iOS PWA (16.4+) over
   HTTPS — subscribe via the settings toggle, trigger a notification from another account,
   confirm the toast, the app badge, and that revoking permission stops delivery.
4. Apps with their own `sw.ts` edits: port the three new handlers and drop the `periodicsync`
   block and `updateBadge()`.

## Verify

```sh
pnpm check
pnpm test:core
```

`grep -rn "periodicsync\|registerPeriodicBadgeSync" frontend/src` must come back empty. The
push-sender unit tests (`backend/src/modules/push/push-sender.test.ts`) cover pruning, backoff and
online subtraction; end-to-end delivery needs the step-3 device pass.
