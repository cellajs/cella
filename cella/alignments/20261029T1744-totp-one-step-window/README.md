---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: gracePeriodInSeconds
---

# TOTP codes verify one step either side of now

An app sets `totp.gracePeriodInSeconds` to `30` in each `shared/config/*.ts` that sets it: at `60` a code verifies in five
time steps, so every guess at an authenticator code hits five codes where the template now accepts three.

## What & why

`matchTOTPStep` accepts every step within ±`gracePeriodInSeconds` of now. The template's 60 seconds accepted k-2 to k+2,
which with daily tiers that restart let a holder of the first factor guess a code at odds of about 30% a year. The
template now accepts k-1 to k+1 (RFC 6238 §5.2), and `totp-budget.ts` adds a three-week tier that a verified code does
not reset.

## Blast radius

Every app: `shared/config` is app-owned, so the app's own `60` stays until it changes it. The three-week tier arrives
with the upgrade. No database, wire or cache change.

## Run

No script: manual.

## Manual steps

1. In each `shared/config/*.ts` with a `totp` entry, set `gracePeriodInSeconds: 30`.

## Verify

Sign in with a code from the authenticator app as usual, then:

```sh
pnpm check
```
