---
syncBreaking: true
clientCacheBump: false
caughtBy: compiler
grep: EmailLayout, EmailMessage, defineEmailTemplate, utcStamp, invite_expires, requestDetails
---

# App email templates forward the mailer's frame and use the shared texts

`EmailLayout` and `EmailMessage` take a required `frame`, which the mailer passes to every template's `component`: an
app-owned template destructures `frame` and forwards it. `utcStamp` and the `email.invite_expires` key are gone. A
template that reports something done as its recipient declares `requestDetails: true`.

## What & why

Every mail now ends its panel with what the mailer adds: request details (country, browser, time) on mail done as the
recipient, and a footer naming the address the mail went to. The mailer hands both over as `frame`. Link expiry comes
from the token policy (`linkExpiresText`), closing lines from `endingFor`, and every moment from `formatMailTime`.

## Blast radius

Sync-breaking for an app with email templates of its own: typecheck flags each `EmailLayout` or `EmailMessage` without
`frame`, and each `utcStamp` call. An app without own templates has nothing to do. No database, lens or
`clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. In each app-owned template, add `frame` to the `component` props and pass `frame={frame}` to `EmailLayout` or `EmailMessage`.
2. Declare `requestDetails: true` on a template whose mail reports something done as its recipient, or reaches an operator inbox.
3. Replace `utcStamp()` with `getIsoDate()` and format the value in the template with `formatMailTime`.
4. Replace `email.invite_expires` with `linkExpiresText(lng, '<link token type>')`, and a closing "if this was not you" line with `endingFor`.

## Verify

```sh
pnpm check
pnpm test
```
