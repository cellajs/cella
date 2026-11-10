---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: newsletter_request, SubscribeNewsletterForm, subscribe-newsletter-form, requestInfoEmail, newsletter_sign_up, newsletter_submit
generate: true
---

# The footer form sends an info request

The request kind `newsletter` is now `info`. An app runs `pnpm generate` for the changed `requests_unique_signup_email_kind`
index, ports `data.sql` into that migration, and moves what the typecheck names: `SubscribeNewsletterForm` is
`RequestInfoForm`, `requestInfoEmail` is `requestReceivedEmail`, and the `email.newsletter_request.*` keys are
`email.info_request.*`.

## What & why

The footer asks visitors to request info, but stored their address as a newsletter signup that no newsletter ever
reached: the newsletter goes to users with the `newsletter` flag. The confirmation mail promised a newsletter. Info
requests now age out after `retention.requestDays` like the other kinds.

## Blast radius

Apps that override the footer form, the confirmation copy or the `newsletter` request kind. The request body's `kind`
enum changes, so `pnpm sdk` rewrites the SDK. Touches the database: one index and one data update.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate` and paste `data.sql` between the generated `DROP INDEX` and `CREATE UNIQUE INDEX`.
2. Rename the app's own overrides of `c:success.newsletter_sign_up` to `c:success.request_info` and `c:newsletter_email` to `c:request_info_email`; `c:newsletter_submit` and `error:newsletter_sign_up` are gone.
3. Move `backend:email.newsletter_request.title` and `.text` overrides to `backend:email.info_request.*`, with copy that promises a reply.

## Verify

```sh
pnpm sdk
pnpm check
```
