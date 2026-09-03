# Web Push for notifications; Periodic Background Sync retired

## What & why

Phases 3 to 5 of `WEB_PUSH_BADGE_PLAN.md`. New `push` module (backend `modules/push/`) stores
per-device Web Push subscriptions and sends one ids-only payload per fresh notification row to
offline subscribers. The notifications settings card gains a per-device toggle. The Periodic
Background Sync badge path is deleted (never fired on Safari/iOS).

## Blast radius

Not sync-breaking: double-gated on config `has.push` (default false) AND `VAPID_*` env keys. Every
app inherits: table `push_subscriptions` (run `pnpm generate`), `/push` routes in the SDK,
service-worker `push`/`notificationclick`/`pushsubscriptionchange` handlers, and removal of the
`periodicsync` handler plus `registerPeriodicBadgeSync()` (closed-app badge updates now arrive only
via push). Custom `lib/sw.ts` or `seen-tracker.tsx` edits: merge by hand.

## Run

No script: manual.

## Manual steps

1. Sync, run `pnpm generate`, apply migrations (`push_subscriptions` plus its grants).
2. To enable: `npx web-push generate-vapid-keys`, set `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (and
   optionally `VAPID_SUBJECT`, a mailto: or URL, default the frontend URL) in the deployment's
   secret manager, flip `has.push` to true in `shared/config/config.default.ts`.
3. Verify on real devices before announcing (desktop Chrome and an installed iOS PWA 16.4+ over
   HTTPS): subscribe via the settings toggle, trigger a notification from another account, confirm
   the toast and app badge, and that revoking permission stops delivery.
4. Apps with their own `sw.ts` edits: port the three new handlers, drop the `periodicsync` block
   and `updateBadge()`.

## Verify

```sh
pnpm check
pnpm test:core
grep -rn "periodicsync\|registerPeriodicBadgeSync" frontend/src   # must come back empty
# backend/src/modules/push/push-sender.test.ts covers pruning, backoff, online subtraction; delivery needs step 3
```
