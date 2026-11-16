---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: isProduction, BACKUP_RETENTION_DAYS, noncurrentDays
---

# One backup period for every copy

Every app adds `retention.backupDays` to `shared/config/config.default.ts`. Infra then sets the database backup
schedule from it in every environment, staging included, and expires uploaded files' earlier versions and final dumps
after it. An app store plugin reads `ctx.backupDays`, since `ProvisionContext.isProduction` is gone.

## What & why

Backup periods were infra literals or Scaleway defaults: production kept the provider's schedule, staging had none,
upload buckets kept versions 30 days and final dumps never expired. `appConfig.retention.backupDays` now sets
`backupScheduleRetention`, the upload buckets' `noncurrentDays`, the reset and teardown backups and a `dumps/` expiry, so
the privacy page can state one period for every copy.

## Blast radius

Every app for the config key. Each environment owes an apply: staging gains daily backups, and upload versions older
than the period go at the next lifecycle run. No wire, cache or schema change.

## Run

No script: manual.

## Manual steps

1. Add `backupDays: 7` to `retention` in `shared/config/config.default.ts`: longer keeps a disaster copy longer, and also every removed row and file.
2. An app store plugin that read `ctx.isProduction` reads `ctx.backupDays`, or derives the mode from its own config.
3. An app that set its own `noncurrentDays` or backup schedule in `infra/` reads `appConfig.retention.backupDays` there.
4. Run **Review & apply changes** for each environment.

## Verify

```sh
pnpm check
pnpm --filter infra exec vitest run
```
