# Observability

This document explains how traces, metrics, and logs move between Cella's services, and how to
instrument a new worker.

### TL;DR

Every service uses the same setup for [OpenTelemetry](https://opentelemetry.io/) traces, metrics,
and logs. They go to [Maple.dev](https://maple.dev) by default, or to any OTLP endpoint. One trace
follows a request from a browser click through the backend. A second follows a database change from
the database-change worker into the backend.

## Architecture

```
                  shared/src/otel.ts
                  createOtelSDK() factory
              ┌──────────┼───────────┐
              ▼           ▼           ▼
          backend        cdc         yjs            frontend
        (Node SDK)    (Node SDK)   (Node SDK)    (Browser SDK)
              │           │           │               │
              ▼           ▼           ▼               ▼
       auto-instrumented  SpanStore   health      WebTracerProvider
       HTTP spans +       Processor   gauges      + FetchInstrumentation
       sync metrics       → pino                  + SpanStoreProcessor
              │           │           │               │
              └─────────┬─┘           │               │
                        ▼             │               ▼
                  OTLP sink           │          traceparent header
                (OTLP HTTP)          │          → backend correlation
                                      │
                                      ▼
                                 OTLP sink
```

## Service overview

| Service | Service name | Auto-instrumentation | Spans | Metrics | SpanStore |
| --- | --- | --- | --- | --- | --- |
| Backend | `{slug}-{MODE}` | Yes (HTTP, DB) | `startSyncSpan()` | Sync counters and histograms | No |
| CDC | `{slug}-cdc` | No | `withSpan()` + `_trace` propagation | Observable gauges | Yes (→ pino debug) |
| YJS | `{slug}-yjs` | No | None currently | Observable gauges | No |
| Frontend | `{slug}-frontend` | Fetch only | Via `FetchInstrumentation` | None | Yes (→ devtools) |

Every backend process mode names itself: `{slug}-api`, `{slug}-jobs` and so on, the same in its logs as in
its traces. Each service also reports the release it runs as `service.version`.

## Destination

A process exports when one of two variables is set. With neither, telemetry stays in the process.

| Variable | Effect |
| --- | --- |
| `MAPLE_SECRET_INGEST_KEY` | All three signals go to Maple.dev. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | All three signals go to this OTLP base URL, as JSON over HTTP. The Maple key is then ignored. |

With the endpoint set, the OTel exporters read the other standard variables themselves:
`OTEL_EXPORTER_OTLP_HEADERS` for an ingest key, and `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` and its
siblings to send one signal elsewhere. `OTEL_TRACES_SAMPLER` and `OTEL_TRACES_SAMPLER_ARG` set how many
traces are kept, whichever destination is used.

```sh
# backend/.env: a local Collector, or any backend that takes OTLP over HTTP
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_EXPORTER_OTLP_HEADERS=authorization=Bearer <key>
```

A deployed VM receives only the variables its runtime secrets declare, so declare these two beside the
Maple key in [runtime-secrets.config.ts](../infra/config/runtime-secrets.config.ts). The browser reports
to Maple through Maple's own SDK and has no OTLP export.

## Add a worker

Every worker needs OTel setup, logging, graceful shutdown, and, if it serves HTTP, a health endpoint. CDC is the reference:

| File | Role | What to know |
| --- | --- | --- |
| [tracing.ts](../cdc/src/lib/tracing.ts) | `createOtelSDK()` from `shared/otel`: `serviceName` (`appConfig.slug` plus worker suffix), `serviceVersion: env.RELEASE_SHA`, `sink: resolveOtlpSink(env)`, `autoInstrumentations: false` | `autoInstrumentations: true` only for HTTP servers. Add a `SpanStoreProcessor` to `spanProcessors` for local span debugging. |
| [pino.ts](../cdc/src/lib/pino.ts) | `createWorkerLog('<worker>', env)` from `shared/pino`, which calls `createLogger()` with the same sink, service name and version | With a sink, logs also ship there via `pino-opentelemetry-transport` in dev and production alike. The console keeps `pino-pretty` in dev and raw JSON in production. |
| [index.ts](../cdc/src/index.ts) | `otel.start()`, then `setupGracefulShutdown({ name, log, cleanup })` from `shared/utils/worker-lifecycle` | `cleanup` closes servers and connections and awaits `otel.shutdown()`. It handles SIGINT/SIGTERM, double-signal force exit, a timeout (default 10s), and uncaught exceptions. |

### Health endpoint (if HTTP)

Serve `createHealthApp({ version, full })` from `shared/health-app`. `full()` returns at least `status` and `uptime`.

### Metrics

Add observable gauges for runtime state, and counters and histograms for request-scoped measurements (see the backend sync-metrics module). Name a metric without its unit and pass the unit as `unit`: `lens.transform.duration` with `unit: 'ms'`.

## Add tracing

### Manual spans

Use `@opentelemetry/api` directly in any service with OTel initialized: `tracer.startActiveSpan()`, set attributes and status, record exceptions, end the span. CDC wraps this in a `withSpan()` helper returning `{ traceId, spanId }` for trace propagation ([cdc/src/lib/tracing.ts](../cdc/src/lib/tracing.ts)).

### Span names and attributes

Span names are constants in [span-names.ts](../shared/src/tracing/span-names.ts), grouped by service prefix (`cdc.*`, `sync.*`). Never inline strings. The shared tracing module also exports attribute builders (`cdcAttrs`, `activityAttrs`, `eventAttrs`). Add a helper when a group of spans shares attributes. Attribute keys are dotted lower snake case: `activity.subject_id`.

## What is emitted

Every span, metric and log record carries `service.name`, `service.version` and `deployment.environment.name`.

| Span | Service | Attributes |
| --- | --- | --- |
| HTTP server, outbound fetch, Postgres query | Backend | The stable OTel HTTP and database conventions |
| `sync.activitybus.receive` | Backend | `event.type`, `event.subject_id`, `event.entity_type` |
| `cdc.activity.create` | CDC | `activity.type`, `activity.action`, `activity.subject_id`, `activity.entity_type` |
| `cdc.wal.process` | CDC | `cdc.lsn`, `cdc.tag`, `cdc.table` |
| `sync.message.process` | Frontend | `sync.entity_type`, `sync.action`, `sync.entity_id` |
| `client.<failure>` | Frontend | An error span for a failure the app caught and continued from |

| Metric | Kind | Unit | Service | Attributes |
| --- | --- | --- | --- | --- |
| `sync.cdc.messages_received` | Counter | `{message}` | Backend | `entity_type` |
| `schema.client_version.seen` | Counter | `{request}` | Backend | `version` |
| `lens.transform.duration` | Histogram | `ms` | Backend | `from`, `to`, `ok` |
| `lens.step.duration` | Histogram | `ms` | Backend | `from`, `to`, `ok` |
| `lens.warnings` | Counter | `{warning}` | Backend | `from`, `to` |
| `cdc.ws.connected` | Gauge | 0 or 1 | CDC | |
| `cdc.ws.messages_sent` | Counter | `{message}` | CDC | |
| `cdc.replication.status` | Gauge | 0 stopped, 1 paused, 2 active | CDC | |
| `cdc.replication.failures_at_position` | Gauge | | CDC | |
| `yjs.connections.active` | Gauge | `{connection}` | YJS | |
| `yjs.documents.active` | Gauge | `{document}` | YJS | |
| `yjs.clients.active` | Gauge | `{client}` | YJS | |

A log record carries the fields of its log line as attributes, and the trace and span it was written in.

## Redaction

Tokens travel in request URLs: magic-link and invitation paths, unsubscribe links, OAuth callbacks. One function,
`scrubUrl` ([scrub-url.ts](../shared/src/utils/scrub-url.ts)), removes them from both signals. `createOtelSDK` registers
a redacting span processor ([redacting-span-processor.ts](../shared/src/tracing/redacting-span-processor.ts)) before
every other processor, so the exporter and debug processors only see scrubbed span names, attributes, events and
status messages. `createLogger` requires the redact key paths and scrubs every logged `url`. A new token route adds its
template to `secretPathTemplates`, a new token query key to `sensitiveQueryKeys`, in that file.

## Trace correlation

A request is one trace:

1. **Frontend**: `FetchInstrumentation` injects `traceparent` on API calls.
2. **Backend**: auto-instrumentation picks up `traceparent` and creates child spans. Each log line written in a span carries that span's trace.

A database change is a second trace:

1. **CDC**: starts a trace per change and stamps its span context as `_trace` (`traceId`, `spanId`, `traceFlags`, `cdcTimestamp`) on the message it sends the backend over WebSocket.
2. **Backend**: the `sync.activitybus.receive` span starts as a child of that span.

The two are not joined: the WAL carries no trace context, so the change a request wrote starts a trace of its own. A stream notification carries none either, so the client's `sync.message.process` span is a third.

## Data model

**SpanStore** is an in-memory ring buffer of finished spans (default 500) with pub/sub and prefix filtering, fed by **SpanStoreProcessor** on span end. The frontend devtools and CDC debug logging read it.

## Health endpoints

| Service | Endpoint | Response |
| --- | --- | --- |
| Backend | `GET /health` | Full diagnostics: status, uptime, database, CDC health, memory |
| CDC | `GET /health` | Status and its reasons, uptime, replication state and the failure it reads again from, slot lag, setup problems, WebSocket connection |
| YJS | `GET /health` | Status, uptime, connection/document/client counts |

All default to **shallow** 204 for load balancers and liveness probes. `?depth=full` returns JSON. Backend health is `unhealthy` when the database probe fails, and `degraded` on lesser component trouble such as event-loop lag, which every service reads as its mean delay over the last 30 seconds. The api process and the jobs worker report a `jobs` component: `degraded`, never `unhealthy`, when no scheduler ran in five minutes, a queue passes its warning size or dead letters wait. The CDC worker grades itself, once: `degraded` while the API is away, a failed flush is being read again or no subscription is open, `unhealthy` when it is stuck at one change, its setup check fails (the publication, replica identity, or its role lacking `REPLICATION` or the RLS bypass), the API has been away five minutes, the slot is invalidated or WAL lag passes its limit ([CDC worker](../cdc/README.md#health-and-configuration)). The backend's `cdc` component passes that grade and its reasons on, and adds only what it alone knows: no worker connected, or a report older than 45 seconds.
