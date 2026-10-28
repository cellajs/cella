---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: prepareEmails
---

# The mailer's send method is `mailer.sendEmails`

`mailer.prepareEmails(template, statics, recipients, replyTo)` is renamed `mailer.sendEmails`, with the same
parameters and behavior. App code that sends mail or mocks the mailer in a test renames its calls.

## What & why

The method renders each recipient's mail and sends the batch; "prepare" told a reader it did only the first half.
Every template call site and the test setup's mailer mock in the template use the new name.

## Blast radius

Breaking for app-owned code that calls or mocks `mailer.prepareEmails` (typecheck flags each site). An app with
none has nothing to do. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Rename `mailer.prepareEmails` to `mailer.sendEmails` in app-owned files, `vi.mocked(mailer.prepareEmails)` in tests included.

## Verify

```sh
pnpm check
```
