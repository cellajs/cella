# Sign-out spends magic links, sign-up gated at completion, streams never stall

## What & why

Sign-out spends the magic link its browser opened, and a second click shows `magic_opened`. `maySignUp(ctx, { email })`
is the one sign-up gate, checked again when a pending OAuth sign-up completes. `markEmailVerified` and its cleanup share
one transaction. `closeAppStreams` aborts before writing and closes streams in parallel. Subscribers carry
`systemAccessAllowed`, and the sweep closes only streams with a session. The `auth_invalidate` heartbeat times out
(`withinTimeout`), and `createPgConnection` sets keepAlive. `renderSectionsHtml(sections, lng)` translates the overflow line.

## Blast radius

Sync-breaking for apps that register stream subscribers, gate sign-up themselves or render digests. No database change.
An invitee who signs up with a provider is signed in at once, without a second mail. An app that never customized
these areas is unaffected.

## Run

No script: manual.

## Manual steps

1. Give app-registered `AppStreamSubscriber`s a `systemAccessAllowed` field; call `closeAppStreams` where `closeAppStream` was called.
2. Route app sign-up checks through `maySignUp(ctx, { email })`; an unverified OAuth result has no `invite` reason.
3. Pass the recipient's language to `renderSectionsHtml`; add `magic_opened` and `email.digest_overflow` to app locales.

## Verify

```sh
pnpm vitest run --project=backend backend/tests/security/sign-out-magic-link.test.ts backend/tests/security/magic-link.test.ts backend/tests/security/session-sweep.test.ts backend/tests/sign-in/oauth.test.ts
pnpm check
```
