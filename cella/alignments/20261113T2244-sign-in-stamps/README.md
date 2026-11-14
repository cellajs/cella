---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: first_seen_at, last_seen_at, last_used_at, notified_at, deviceDaysUnseen
generate: true
---

# Devices and identities stamp their sign-ins

`devices.firstSeenAt` is `createdAt`, `devices.lastSeenAt` is `lastSignInAt` (index `devices_last_sign_in_at_idx`), and
`identities.lastUsedAt` is `lastSignInAt`, and `devices.notifiedAt` (the sign-in mail stamp) is `mailedAt`
(index `devices_user_id_mailed_at_idx`). The retention key `deviceDaysUnseen` is `deviceDaysSinceSignIn`, and its
sweep rule reads `last_sign_in_at`. `findNewDevices` takes `createdAfter`, `findUserSessions` takes no `revokedSince`
and lists revoked sessions until the sweep removes them, and `revokeApiKey` stamps its own `revokedAt`.
`pnpm generate` with this folder's `hints.json` renames the columns and the index.

## What & why

Both tables were written only at a sign-in, while their names said "seen" and "used": a reader took them for activity
stamps. The names now say what writes them. The wire is unchanged: an identity still answers `lastUsedAt` in the
account's sign-in methods, a shape it shares with passkeys and TOTP.

## Blast radius

Every app's database and every app config that sets `retention.deviceDaysUnseen`. The typecheck names typed reads,
writes and the config key; raw SQL naming the old columns escapes it. No wire, cache or client change.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate --hints "$(cat cella/alignments/20261113T2244-sign-in-stamps/hints.json)"`: it renames three columns and one index, sets the `now()` default on `devices.created_at`, and rewrites `apply_retention()` in the side effects.
2. An app config that sets `retention.deviceDaysUnseen` sets `deviceDaysSinceSignIn`.
3. App code, seeds and tests on the old column names use the new ones.

## Verify

```sh
pnpm migrate
pnpm check
```
