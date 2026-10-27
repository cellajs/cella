---
syncBreaking: true
clientCacheBump: true
caughtBy: nothing
grep: stepUpGuard, ensureStepUp, requireStepUp, sendStepUpLink, stepUpUrl, step-up-confirmed, step-up-requested, sign_in_again, step_up_link_sent
---

# Step-up mails a code, and an action names its tier

The emailed step-up link is gone: `sendStepUpLink` becomes `sendStepUpCode` (no body), `POST /step-up` takes `emailCode`,
and the `/auth/step-up-confirmed` route, its page, the `step-up-requested` cookie and the `sign_in` method go. A route
picks one of three guards, `stepUpGuard`, `stepUpFactorGuard` or `stepUpEnrollGuard`, and a frontend `ensureStepUp`
call names its tier. An app's step-up mail template takes `code`, `browser` and `os` in place of `stepUpUrl`.

## What & why

A link that works only in the browser that asked fails when mail is read on a phone or in another browser, and leaves
a tab behind. A code typed into the same dialog does neither. Actions that hand out lasting access (API keys, service
accounts, OAuth consent) now need a second factor, and setting one up proves it on the session.

## Blast radius

Sync-breaking for an app with its own step-up guarded routes, `ensureStepUp` callers, a customized step-up mail or
dialog. No database migration. Upstream bumps `clientCacheVersion` for the removed link route; an app that sets its own
bumps it too. An app that never touched step-up gets the rest from the sync.

## Run

No script: manual.

## Manual steps

1. Give each app route that carried `stepUpGuard` its tier: `stepUpFactorGuard` when it hands out lasting access,
   `stepUpEnrollGuard` when it sets up a second factor, `stepUpGuard` for every other account change.
2. Pass the same tier to each app call of `ensureStepUp(tier)` and `requireStepUp(session, tier)`.
3. A customized `backend/emails/templates/step-up.tsx` renders `code` and names `browser` and `os`; its copy keys are
   `email.step_up.*` in `locales/en/backend.json`.
4. Drop app links to `/auth/step-up-confirmed` and app copy for the removed `c:step_up_*` keys.

## Verify

The compiler flags the removed calls and the missing tier arguments; it cannot tell which tier an app route needs. Read
each app route the `stepUpGuard` grep finds, then:

```sh
pnpm sdk
pnpm check
```
