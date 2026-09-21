# devices keeps only what is read: the key and three timestamps

## What & why

`devices` drops `lastStrategy`, `deviceName`, `deviceType`, `deviceOs`, `browser` and `ipCountry`. Every sign-in
wrote them and nothing read them: the new sign-in notice builds its text from the request, and the sessions list
reads the same facts from the session row, which is the snapshot of that sign-in. The table is now
`(userId, deviceIdHash, firstSeenAt, lastSeenAt, notifiedAt)`. `enrollDevice(userId, deviceId)` loses its
`context` and `strategy` parameters.

## Blast radius

Database change, not sync-breaking, no cache bump, no API change: apps run `pnpm generate`. An app that applies
this together with `20260921T1433-devices-table` gets one migration that creates the table in its final shape.

## Run

No script: manual.

```sh
pnpm generate
```

The schema migration is six `DROP COLUMN` statements (or none, when the table is created in the same run). No
rename prompts.

## Manual steps

1. App code calling `enrollDevice` drops the last two arguments.
2. App code reading a dropped column reads it from the session row (`sessionsTable`) of that sign-in.

## Verify

```sh
grep -rn "lastStrategy\|enrollDevice(" backend/src backend/tests
pnpm --filter backend test -- tests/sign-in
pnpm check
```
