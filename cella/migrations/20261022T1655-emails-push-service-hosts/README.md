---
syncBreaking: true
clientCacheBump: false
---

# Emails render without a re-parse, push subscriptions only from known push services

An app adds `pushServiceHosts` to `shared/config/config.default.ts`, the hosts a Web Push subscription endpoint may
name. The rest arrives with the sync: the email renderer writes final HTML with no rehype pass, and the sync drops
`rehype`, `rehype-stringify` and `@types/hast` from `backend/package.json`. `web-push` stays. An app's own email
template follows the markup rules in step 3.

## What & why

`render()` is the doctype plus `jsxToString`: the rehype plugins (`conditional.ts`, `move-style.ts`, `raw.ts`,
`visit.ts`) are deleted, and `<style>` content is written raw (fixes `&quot;` in the newsletter CSS).
`POST /push/subscriptions` refuses endpoints outside `pushServiceHosts`, because the server POSTs each push there.
`push-sender.ts` gives web-push a 10 s timeout and per-call VAPID details, checks the VAPID keys once and counts 403s
without pruning them.

## Blast radius

Sync-breaking: `config.default.ts` is app-owned, so the type check fails until `pushServiceHosts` is added. Besides
a dropped `data-skip` attribute, 28 of cella's 32 mailer renders keep their bytes. No database, API shape or cache
change. Push stays off unless `has.push` and VAPID keys are set.

## Run

No script: manual.

## Manual steps

1. In `shared/config/config.default.ts`, add `pushServiceHosts: ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com', '*.notify.windows.com']` with cella's comment; `*.` matches any subdomain.
2. The sync removes the three packages when the app never changed their entries; one the app's own code imports is kept and listed.
3. App-owned templates: rows inside `<tbody>`, `<style>` through `EmailLayout`'s `headChildren`, `Preview` inside `Body`; `Conditional` has no `head` prop and `Raw` no `disablePlainTextOutput`.
4. `VAPID_SUBJECT` must be a `mailto:` or `https:` URL; the default (`frontendUrl`) is refused in local development, and push then logs "Push sending is off" once.
5. Changing the key pair: browsers subscribed under the old public key answer 403, logged as one warning per send; a user turns the device toggle off and on to subscribe again.
6. Before turning `has.push` on: subscribe and send from desktop Chrome, Firefox and an installed iOS PWA; a browser whose push service is not in `pushServiceHosts` gets 400 `invalid_push_endpoint`.

## Verify

```sh
pnpm install
pnpm --filter backend exec vitest run src/modules/push tests/security/push-endpoints.test.ts tests/emails
pnpm check
```
