---
breaking: true
clientCacheBump: false
caughtBy: compiler
generate: true
grep: readStepUp, requireStepUp, updateSessionSteppedUp
---

# A step-up counts only in the browser that proved it

`sessions` gains `stepped_up_secret`, the hash of a new Strict `session-step-up` cookie, and a step-up stamp counts only for a request presenting that cookie. `readStepUp` and `requireStepUp` take the request context (`ctx`) where they took the session, `updateSessionSteppedUp` takes the cookie's hash, and `stampStepUp(ctx, via)` stamps a session and sets the cookie. Run `pnpm generate` once after the upgrade.

## What & why

A step-up stamped the session row and kept the token, so every copy of the session cookie, made at any time before, passed every step-up tier for ten minutes. The stamp now goes out with a cookie of its own: a copy taken before the proof lacks it. `userGuard` reads the cookie into `ctx.var.stepUpCookie`; a sign-in that starts stepped up sets it too.

## Blast radius

An app that calls `readStepUp`, `requireStepUp` or `updateSessionSteppedUp` in its own code: typecheck flags each call. Touches the database (one nullable column). No wire change, no cache bump.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`: it writes `ALTER TABLE "sessions" ADD COLUMN "stepped_up_secret" varchar(255);`; no hints, no hand-written SQL.
2. Pass `ctx` to `readStepUp` and `requireStepUp`; a route without `userGuard` passes `{ var: { session, stepUpCookie: getAuthCookie(ctx, 'session-step-up') } }`.
3. Stamp a step-up with `stampStepUp(ctx, via)`, which sets the cookie the stamp counts with.
4. An app test that steps up and then calls a guarded route sends the cookies the step-up response set (`keepCookiesOf` in `backend/tests/security/session-helpers.ts`).

## Verify

```sh
pnpm generate
pnpm check
```
