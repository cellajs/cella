---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: scrollMarginTop, spy-authentication-anchor-wrap
---

# The screenshot driver turns MFA on, so the settings shot frames a taller card

On a throwaway database the screenshot driver now runs `pnpm --filter backend showcase:mfa`, which turns MFA on for the
shot user with a passkey and an authenticator app, and for a share of their organizations' members. The authentication
card on the account page grows by those two rows, so a `settings` shot in the app-owned
`cella/skills/screenshots/shots-config.mjs` that scrolls it in with `scrollMarginTop = '3rem'` cuts the next card's
description at the bottom edge. Set the margin to `'1.5rem'`.

## What & why

Marketing shots showed MFA off everywhere: the account page with empty passkey and authenticator rows, and a red shield
on every member. The driver step (`shot-driver.mjs`) adds factors that exist only to be shown, on a throwaway database
only. The `settings` entry in the app's `shots-config.mjs` keeps the margin chosen for the shorter card.

## Blast radius

An app whose `shots-config.mjs` holds the template's `settings` shot (projectcampus does) and shoots from a throwaway
database. No wire, database or cache change. A run against the database `backend/.env` names leaves MFA off.

## Run

No script: manual.

## Manual steps

1. In `cella/skills/screenshots/shots-config.mjs`, set `scrollMarginTop` in the `settings` shot's `open` to `'1.5rem'`.

## Verify

Re-shoot it (`node cella/skills/screenshots/shot-driver.mjs settings` through the throwaway exports) and check that the
frame ends below the next card's description.

```sh
pnpm check
```
