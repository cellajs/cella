---
syncBreaking: true
clientCacheBump: false
caughtBy: compiler
grep: /auth/unsubscribed, unsubscribe_title, unsubscribe_text, unsubscribeNotificationsOp, listUnsubscribe
---

# An unsubscribe link asks first, and a POST turns the category off

Opening `/notifications/unsubscribe` changes nothing any more: it redirects to the `/auth/unsubscribe` page, which posts
the same URL to turn the category off and `/notifications/resubscribe` to undo it. `/auth/unsubscribed`, its page and
the `unsubscribe_title`/`unsubscribe_text` keys are gone; `unsubscribeNotificationsOp` is `setEmailCategoryOp`.

## What & why

A GET that changed state let mail scanners and link previews turn a category off with nobody clicking, and the old page
always spoke of the newsletter and showed the browser's address, not the link's. Mail clients' one-click unsubscribe
(RFC 8058) posts the URL from the `List-Unsubscribe` header a template names with `listUnsubscribe`.

## Blast radius

Sync-breaking for app code that links to `/auth/unsubscribed` (the route types flag it), calls `unsubscribeNotificationsOp`,
or has tests that open an unsubscribe link and expect the change. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Point app links to `/auth/unsubscribed` at `/auth/unsubscribe`, or drop them.
2. In app tests, post the unsubscribe URL (a form post, as a mail client does) where they opened it.
3. On an app-owned template with a per-recipient unsubscribe URL, declare `listUnsubscribe: '<recipient field>'`.

## Verify

```sh
pnpm check
pnpm test
```
