# Sign-ins enroll the browser in a devices table

## What & why

New table `devices` (`backend/src/modules/auth/devices-db.ts`, `devicesTable`): one row per user and
browser, keyed on `(userId, deviceIdHash)`. `createSession` enrolls the browser on every sign-in; a
first insert on an account that signed in before sends the `new-sign-in` account security email. A daily
`prune-devices` job drops rows unseen for 400 days. `mfa` sessions now get a device id, the same-browser
replace and the `maxSessionsPerUser` cap, like regular ones. The `device-id` cookie is SameSite Lax.

## Blast radius

Database change, not sync-breaking, no cache bump: apps run `pnpm generate`. Until the table exists sign-in
keeps working and logs `Failed to enroll device on sign-in`. An app with its own `devices` table has a
name clash. Users with MFA on are now capped at `maxSessionsPerUser` sessions.

## Run

No script: manual.

```sh
pnpm generate
```

## Manual steps

1. Run `pnpm generate`: it emits the `devices` table migration and a side-effects migration granting `runtime_role` CRUD on it.
2. An app that lists tables by hand (test truncation helpers, grant lists) adds `devices`; truncating `users` with CASCADE already clears it.
3. An app with translated backend emails adds `email.account_security.new-sign-in.title` and `.text` to its `locales/<lng>/backend.json`; without them the mail falls back to English.

## Verify

```sh
pnpm --filter backend test -- tests/sign-in tests/emails
pnpm check
```

After migrating a real database, check the grant there rather than trusting the exit code:

```sql
select has_table_privilege('runtime_role', 'public.devices', 'INSERT');
```
