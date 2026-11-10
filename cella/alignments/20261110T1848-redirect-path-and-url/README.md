---
breaking: true
clientCacheBump: true
caughtBy: nothing
grep: redirectAfter, redirectTo
---

# An in-app redirect is a redirectPath, an absolute one a redirectUrl

The magic-link body takes `redirectPath` where it took `redirect`, and an OAuth or SSO start takes the query
`redirectPath` where it took `redirectAfter`, as does the `oauth-state` cookie. The held-link redeem (`redeemLinkToken`)
and the OAuth consent decision answer `redirectUrl` where they answered `redirectTo`. `sendMagicLinkOp` takes
`redirectPath`, and the test helper `openHeldLink` returns `redirectUrl`.

## What & why

The token column and `defaultRedirectPath` said `redirectPath` for a path in the app, while the API said `redirect`,
`redirectAfter` and `redirectTo`. A path in the app is now `redirectPath` and an absolute target `redirectUrl`. The
frontend's `?redirect=` search param belongs to its routes, not the API, and stays.

## Blast radius

Every app with its own sign-in links or tests. A start URL that still sends `redirectAfter` loses its redirect without
an error. A sign-in under way across the deploy completes once on the default page. A tab loaded before it needs a
reload. `clientCacheVersion` moves.

## Run

No script: manual.

## Manual steps

1. Replace `redirectAfter` with `redirectPath` in sign-in start URLs, `oauth-state` cookie fixtures and tests.
2. Pass `redirectPath` to `sendMagicLink` and `sendMagicLinkOp` where the app passed `redirect`.
3. Read `redirectUrl` where the app read `redirectTo` from `redeemLinkToken`, the consent decision or `openHeldLink`.

## Verify

```sh
pnpm check
```

Then open a protected deep link signed out, sign in with an OAuth provider and with a magic link, and check each returns
to the deep link.
