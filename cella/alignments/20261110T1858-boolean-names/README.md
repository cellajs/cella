---
breaking: true
clientCacheBump: true
caughtBy: compiler
grep: isCurrent, isNewDevice, wasInvited, mention_email, comment_email
generate: true
---

# A boolean is a bare adjective or noun

A session's `isCurrent` and `isNewDevice` are `current` and `newDevice`, a request's `wasInvited` is `invited`,
`has.uploadEnabled` is `has.uploads` and `theme.navigation.hasSidebarTextLabels` is `sidebarTextLabels`. The
notification preferences `mentionEmail` and `commentEmail` are `mentionEmails` and `commentEmails` on the wire and as
columns, which `pnpm generate` with this folder's `hints.json` renames, and `has.commentEmail` is `has.commentEmails`.

## What & why

Most booleans are a bare adjective or noun (`archived`, `hidden`, `muted`, `mfaRequired`); a few led with `is`, `was`
or `has`, or ended in `Enabled`. A name ending in `Email` holds an address everywhere but in the two preferences that
say whether a kind of email goes out. Those names now follow the rule. `emailEnabled` and `isSystemAdmin` stay: no bare form fits them.

## Blast radius

Every app: `shared/config` and `backend/drizzle` are app-owned, and the typecheck names each config key and typed read.
Raw SQL and untyped test rows that name the old columns or fields, and outside clients, escape it.
`clientCacheVersion` moves.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate --hints "$(cat cella/alignments/20261110T1858-boolean-names/hints.json)"`: it renames two columns of `notification_preferences`.
2. In the app's `shared/config` files, rename `has.uploadEnabled` to `has.uploads`, `has.commentEmail` to `has.commentEmails` and `theme.navigation.hasSidebarTextLabels` to `sidebarTextLabels`.
3. Replace `isCurrent` and `isNewDevice` on a session with `current` and `newDevice`, `wasInvited` with `invited`, and the preferences `mentionEmail` and `commentEmail` with `mentionEmails` and `commentEmails`, in app code, raw SQL and tests; the mail templates `mentionEmail` and `commentEmail` keep their names.

## Verify

```sh
pnpm migrate
pnpm check
```
