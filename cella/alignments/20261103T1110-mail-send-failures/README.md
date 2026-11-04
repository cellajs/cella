---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: sendEmails
---

# A failed mail send reaches its caller

`mailer.sendEmails` now throws an `AggregateError` after every batch was tried when Brevo refused one or could not be reached. App code that calls it in a request must decide what a failed mail means for that request and catch where the request should still succeed.

## What & why

`sendBatch` logged a failed send and returned, so every stamp that followed a send (`emailedAt` on an instant notification mail, `digestedAt` and `lastDigestAt` on a digest) recorded a mail nobody received, and the digest then skipped the row for good. The mailer now tries every batch and throws one `AggregateError` naming each failure; the template's callers catch where a request has stored its rows and a resend exists (invitation mails), and let the error through where the mail is the request's only effect (the newsletter).

## Blast radius

Every app caller of `mailer.sendEmails` in a request path: a request that answered success after a swallowed failure now answers 500 unless it catches. raak and projectcampus call the mailer only through template code and need no change. No database or cache change.

## Run

No script: manual.

## Manual steps

1. Grep app code for `mailer.sendEmails` and `sendEmails(`. For each call in a request that already stored its rows, catch the `AggregateError`, log it, and let the request answer; for a call whose mail is the request's only effect, let it through.
2. Where a stamp follows a send (a column that records "mailed"), write it after the send resolves, never before.

## Verify

Read each caller found in step 1. Then:

```sh
pnpm check
```
