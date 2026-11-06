---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: showcase:mfa, showcase-mfa
---

# The marketing screenshots seed from an app-owned json/showcase.json

`pnpm seed showcase` seeds the dataset the marketing screenshots show from `json/showcase.json`, a file the app owns and
pins, and `pnpm --filter backend showcase:mfa` is gone: its passkey, authenticator app and MFA flags are part of the
seed. A pinned file never arrives through an upgrade, so `backend/scripts/seeds/showcase.seed.ts` fails the typecheck
until the app pins `json/showcase.json` and creates it, from the template's copy with its own names.

## What & why

Shots taken from the random seed showed a hundred faker companies, five unseen items in every organization and twelve
unread notifications, and changed every name on each re-shoot. The showcase seed writes a curated dozen organizations,
their members, the admin's menu, a short inbox and MFA from one data file, the same on every run, and runs only when
named. `explicit` and `precheck` on `SeedScript` (`backend/scripts/types.ts`) carry that.

## Blast radius

Every app on the next upgrade: the typecheck names the missing `#json/showcase.json`. No wire, database or cache change.
An app that removed the attachment module deletes `showcase.seed.ts` with the attachment seed it imports.

## Run

No script: manual.

## Manual steps

1. Add `'json/showcase.json'` to `overrides.pinned` in `cella/cella.config.ts`.
2. Copy `json/showcase.json` from the template, then give it the app's own organization names, people, email domain and admin address; role names are the app's organization roles.
3. Shoot with `ADMIN_EMAIL` exported as that admin address and the database seeded by `pnpm seed showcase` (the screenshots skill, "A clean database").

## Verify

```sh
pnpm check
```
