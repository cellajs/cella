---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: MAPLE_SECRET_INGEST_KEY, maple-secret-ingest-key, mapleSecretIngestKey, OtelSDK, resolveOtlpSink, createOtelSDK
---

# Telemetry goes to the standard OTLP variables alone

`MAPLE_SECRET_INGEST_KEY`, the runtime secret `maple-secret-ingest-key` and the fallback to Maple's endpoint are gone: a
process exports only where `OTEL_EXPORTER_OTLP_ENDPOINT` is set, its key in `OTEL_EXPORTER_OTLP_HEADERS`. A deployed app
applies, then stores the runtime secrets `otlp-endpoint` and `otlp-headers`. Code that builds an `OtelSDK` by hand adds
`callbackTimeoutMs`. Every service also reports its runtime, process and pool metrics once a minute.

## What & why

`resolveOtlpSink` reads `OTEL_EXPORTER_OTLP_ENDPOINT` alone, and `workerEnvBase` and the backend's env declare
`OTEL_EXPORTER_OTLP_HEADERS` beside it: one destination per protocol, and no vendor in config, env or secrets.
`createOtelSDK` takes a `pool` whose connections it reports, `OtelSDK` gains `callbackTimeoutMs`, and the jobs worker
reports the database's statistics (`registerPostgresMetrics`). A request span names its tenant, organization and user
(`backend/src/lib/request-span.ts`).

## Blast radius

Every app that exports telemetry. A machine that sets only `MAPLE_SECRET_INGEST_KEY` exports nothing after the upgrade,
and nothing fails. No database, cache or lens change. An app that never set the key and builds no `OtelSDK` of its own
has only the steps marked "No step".

## Run

No script: manual.

## Manual steps

1. Not caught by the compiler. Each `.env` or CI secret that sets `MAPLE_SECRET_INGEST_KEY` sets the same destination in the standard variables, for Maple `OTEL_EXPORTER_OTLP_ENDPOINT=https://ingest.maple.dev` and `OTEL_EXPORTER_OTLP_HEADERS=x-maple-ingest-key=<key>`, and drops the key.
2. Not caught by the compiler. Per deployed environment: copy the value of `maple-secret-ingest-key`, run `pnpm cella infra apply` (it deletes that container and makes `otlp-endpoint` and `otlp-headers`), store both values in **Env vars & secrets**, then deploy. Until then the services export nothing.
3. Caught by the compiler. Code or a mock that builds an `OtelSDK` without `createOtelSDK` adds `callbackTimeoutMs`; a call of `resolveOtlpSink` or a read of `env` that names `MAPLE_SECRET_INGEST_KEY` drops it.
4. An app's own worker with a database pool passes it to `createOtelSDK` as `pool: { name, load }`, as `cdc/src/lib/tracing.ts` does: `start()` then reports its connections.
5. Not caught by the compiler. Request spans carry `tenant.name`, `organization.name` and `user.id` to the destination: an app whose privacy text lists what its monitoring receives names them.
6. No step: metrics export every 60 s outside development and every 5 s in it (`OTEL_METRIC_EXPORT_INTERVAL` wins), every export is gzipped unless `OTEL_EXPORTER_OTLP_COMPRESSION` is set, and each process carries its own `service.instance.id` on spans and metrics.
7. No step: a caller's `baggage` is read into the request's context and passed on to no outgoing request.
8. No step: without `OTEL_TRACES_SAMPLER`, a request whose caller flags its trace not sampled is still recorded, so more spans reach the destination.
9. No step: a 4xx answer records no exception on the request span, the request log line has a message (method, route, status, duration), and a logged error carries `exception.type`, `exception.message` and `exception.stacktrace`.
10. No step: in a checkout without `RELEASE_SHA`, every service reports `git rev-parse HEAD` as its release, and a worker's development wait for the backend makes no span.

## Verify

```sh
pnpm --filter infra exec vitest run
pnpm check
```

By hand: start the backend with `OTEL_EXPORTER_OTLP_ENDPOINT` set to a local Collector and see traces, logs and metrics
arrive under the service's name.
