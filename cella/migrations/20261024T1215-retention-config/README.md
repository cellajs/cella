---
syncBreaking: true
clientCacheBump: false
---

# Retention periods live in appConfig.retention, applied by apply_retention()

The app's `shared/config/config.default.ts` gets the `retention` block (the sync brings the template's). App code that
imported `pruneDevices` or `oidcPayloadsSweepJob` drops the import. `pnpm generate` writes a side-effect migration that
replaces `maintain_partitions()` with `apply_retention()`, and the next migrate moves the pg_cron job over.

## What & why

Periods were constants in five places. `appConfig.retention` now holds them, and the sweep list in
`backend/scripts/migrations/10-retention.migration.ts` (`sweepRules`) reads them. Partitions, sessions, tokens,
devices, OIDC payloads, contact and waitlist requests, rejected and mailed invitations, rate-limit rows and push
subscriptions all go nightly in `apply_retention()`. The `prune-devices` and `oidc-payloads-sweep` jobs are gone.

## Blast radius

Every app: a new config block, a renamed migration producer (`10-partitions` became `10-retention`) and procedure, and
rows that never ended before are deleted at the first nightly run. No client cache bump.

## Run

No script: manual.

## Manual steps

1. Copy the `retention` block into the app's `config.default.ts` if the sync did not, and set the app's own periods.
2. An app partition entry in `appPartitionConfigs` may read its period from `appConfig.retention.activityDays`.
3. Replace imports of `pruneDevices`, `deleteStaleDevices`, `deleteExcessDevices` and `oidcPayloadsSweepJob`; their rules live in `sweepRules`.
4. Run `pnpm generate`, then `pnpm migrate` on a dev database to see the `apply-retention` job replace `partition-maintenance`.

## Verify

```sh
pnpm generate
pnpm --filter backend test
pnpm check
```
