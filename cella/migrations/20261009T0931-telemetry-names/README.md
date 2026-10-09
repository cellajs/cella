---
syncBreaking: true
clientCacheBump: false
---

# Telemetry names and the OTLP destination

An app with dashboards, alerts or code of its own on the telemetry updates them: span attribute keys are dotted lower
snake case (`activity.subject_id`), two metrics lost their unit suffix (`lens.transform.duration`), backend logs carry
`<slug>-<MODE>` as service name, and `createOtelSDK` and `createLogger` take `sink` where they took
`mapleSecretIngestKey`. A deploy that sets `OTEL_EXPORTER_OTLP_ENDPOINT` drops a trailing `/v1` from its value.

## What & why

Telemetry names followed three styles and the unit sat in two metric names; they now follow the OpenTelemetry
conventions, before a dashboard depends on them. The app's processes export to any OTLP endpoint through
`resolveOtlpSink` (`shared/otlp-sink`), which replaces the Maple constants in `shared/src/otel.ts` and
`shared/src/pino.ts`. The deploy tooling reads `OTEL_EXPORTER_OTLP_ENDPOINT` as the base URL the OTel SDKs read.

## Blast radius

Sync-breaking for an app with dashboards or alerts on these names, its own callers of `createOtelSDK` or
`createLogger`, or a deploy that sets the OTLP endpoint variable. No database, cache or lens change. An app with
none of these is unaffected.

## Run

No script: manual.

## Manual steps

1. Metrics: `lens.transform.duration_ms` is `lens.transform.duration` and `lens.step.duration_ms` is `lens.step.duration`, both with unit `ms`; `cdc.ws.messages_sent` is a counter, no longer a gauge.
2. Metric attribute: `entityType` is `entity_type` on `sync.cdc.messages_received`.
3. CDC span attributes: `lsn` is `cdc.lsn`, `activity.subjectId` is `activity.subject_id`, `activity.entityType` is `activity.entity_type`.
4. Backend span attributes: `event.subjectId` is `event.subject_id`, `event.entityType` is `event.entity_type`; `parent_trace_id` is gone, the span is a child of the CDC span.
5. Client span attributes: `entityType`, `action` and `entityId` are `sync.entity_type`, `sync.action` and `sync.entity_id`; error spans use `product_type`, `mutation_id` and `consecutive_failures`.
6. Service names: a backend process logs as `<slug>-<MODE>`, so a log query on `<slug>-api` no longer returns the jobs, mcp and oauth processes.
7. App code that calls `createOtelSDK({ mapleSecretIngestKey })` or `createLogger({ enableOtelTransport, mapleSecretIngestKey })`: pass `sink: resolveOtlpSink(env)` from `shared/otlp-sink`.
8. A deploy environment that sets `OTEL_EXPORTER_OTLP_ENDPOINT` to a value ending in `/v1`: remove that suffix.

## Verify

```sh
pnpm check
```
