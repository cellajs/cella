---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: invoked_at
generate: true
---

# A link is redeemed once, and a magic link signs in once

`tokens.invokedAt` is `redeemedAt`, `invokeToken` in `token-lifecycle.ts` is `redeemToken` and `deleteUnopenedLinkToken`
is `deleteUnredeemedLinkToken`. `deleteOpenedMagicLink`, `deleteOpenedLinkTokens` and `explainOpenedMagicLink` are gone:
`handleMagicLink` spends its link (`spendRedeemedLink`), and `refuseUnredeemable` refuses every link kind. The magic link
request helpers lost their kind parameter (`rememberMagicLinkRequest`, `isMagicLinkRequestedHere`,
`forgetMagicLinkRequest`). The `/invoke-token/` path and the SDK's `invokeToken` stay.

## What & why

Redemption had four verbs and has one. A magic link stayed usable after its sign-in, so sign-out hunted it down; the
sign-in now spends it. "Opened or expired" was decided three ways; one rule now answers a redeemed link this browser
does not hold with `<kind>_opened` while its single-use window runs, then `<kind>_expired`.

## Blast radius

Every app's database: a column rename. The typecheck names app code on the old names; raw SQL naming `invoked_at`
escapes it. People see `invitation_expired` once an opened invitation's window ends, and a second click on a magic link
or a failed second factor needs a new link.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate --hints "$(cat cella/alignments/20261113T2243-link-token-redemption/hints.json)"`: it renames `tokens.invoked_at` to `redeemed_at` and nothing else.
2. App code, seeds and tests that read or write `invokedAt` on a token row use `redeemedAt`.
3. An app with its own translations of `shared/locales/*/error.json` adds `oauth-verification_opened`.

## Verify

```sh
pnpm migrate
pnpm check
```
