# Scrubbed logs and traces, secretless frontend builds, one job owner

## What & why

`scrubUrl` lives in `shared/src/utils/scrub-url.ts` and a redacting span processor runs before export; traces now
export (the empty `spanProcessors` bug). `createLogger` requires `redactPaths`. Boot redacts secrets by value. The
deploy pipeline builds the frontend in a job without secrets. Scheduled jobs run on `RUN_JOBS` instances, one at a
time through an advisory lock (`backend/src/lib/job-ownership.ts`).

## Blast radius

Sync-breaking for apps importing `#/utils/scrub-url` or `scrubPath`, building loggers, or with extra API services.
Jobs start running in production at the next deploy. No database change.

## Run

No script: manual.

## Manual steps

1. Import `scrubUrl` from `shared/utils/scrub-url`; add app token routes to `secretPathTemplates` or `sensitiveQueryKeys`.
2. Pass `redactPaths` to every `createLogger`.
3. Set `RUN_JOBS` on the service that should run jobs if an app moved `primaryRollout`.
4. Expect the first production run of the reaper, digest, device prune and OAuth sweep.

## Verify

```sh
pnpm vitest run shared/src
pnpm --filter infra exec vitest run
pnpm check
```
