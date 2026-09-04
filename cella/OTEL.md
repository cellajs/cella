# Observability

This document explains how traces, metrics, and logs move between Cella's services, and how to
instrument a new worker.

### TL;DR

Every service uses the same setup for [OpenTelemetry](https://opentelemetry.io/) traces, metrics,
and logs, with [Maple.dev](https://maple.dev) as the default destination. The same trace follows a
request from a browser click, through the backend and database-change worker, to the live update
sent back to clients.

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
                  Maple.dev           │          traceparent header
                (OTLP HTTP)          │          → backend correlation
                                      │
                                      ▼
                                 Maple.dev
```

## Service overview

| Service | Service name | Auto-instrumentation | Spans | Metrics | SpanStore |
| --- | --- | --- | --- | --- | --- |
| Backend | `{appName}-api` | Yes (HTTP, DB) | `withSpan()`, `startSyncSpan()` | Sync counters and histograms | No |
| CDC | `{appName}-cdc` | No | `withSpan()` + `_trace` propagation | Observable gauges | Yes (→ pino debug) |
| YJS | `{appName}-yjs` | No | None currently | Observable gauges | No |
| Frontend | `{appName}-frontend` | Fetch only | Via `FetchInstrumentation` | None | Yes (→ devtools) |

## Add a worker

Every worker needs OTel setup, logging, graceful shutdown, and, if it serves HTTP, a health endpoint. CDC is the reference:

| File | Role | What to know |
| --- | --- | --- |
| [tracing.ts](../cdc/src/lib/tracing.ts) | `createOtelSDK()` from `shared/otel`: `serviceName` (`appConfig.slug` plus worker suffix), `mapleSecretIngestKey: env.MAPLE_SECRET_INGEST_KEY`, `autoInstrumentations: false` | `autoInstrumentations: true` only for HTTP servers. Add a `SpanStoreProcessor` to `spanProcessors` for local span debugging. |
| [pino.ts](../cdc/src/lib/pino.ts) | `createWorkerLog('<worker>', env)` from `shared/pino`, which calls `createLogger()` with `enableOtelTransport: true` and the same key and service name | With a key, logs also ship to Maple via `pino-opentelemetry-transport` in dev and production alike. The console keeps `pino-pretty` in dev and raw JSON in production. |
| [index.ts](../cdc/src/index.ts) | `otel.start()`, then `setupGracefulShutdown({ name, log, cleanup })` from `shared/utils/worker-lifecycle` | `cleanup` closes servers and connections and awaits `otel.shutdown()`. It handles SIGINT/SIGTERM, double-signal force exit, a timeout (default 10s), and uncaught exceptions. |

### Health endpoint (if HTTP)

Serve `createHealthApp({ version, full })` from `shared/health-app`. `full()` returns at least `status` and `uptime`.

### Metrics

Add observable gauges for runtime state, and counters and histograms for request-scoped measurements (see the backend sync-metrics module):

## Add tracing

### Manual spans

Use `@opentelemetry/api` directly in any service with OTel initialized: `tracer.startActiveSpan()`, set attributes and status, record exceptions, end the span. CDC wraps this in a `withSpan()` helper returning `{ traceId, spanId }` for trace propagation ([cdc/src/lib/tracing.ts](../cdc/src/lib/tracing.ts)).

### Span names and attributes

Span names are constants in [span-names.ts](../shared/src/tracing/span-names.ts), grouped by service prefix (`cdc.*`, `sync.*`). Never inline strings. The shared tracing module also exports attribute builders (`cdcAttrs`, `activityAttrs`, `eventAttrs`). Add a helper when a group of spans shares attributes.

## Trace correlation

1. **Frontend**: `FetchInstrumentation` injects `traceparent` on API calls.
2. **Backend**: auto-instrumentation picks up `traceparent` and creates child spans.
3. **CDC**: stamps `_trace` (`traceId`, `spanId`, `cdcTimestamp`) on activity payloads sent to the backend over WebSocket.
4. **Backend → Frontend**: SSE notifications carry `_trace`. The frontend computes `e2e_latency_ms = now - cdcTimestamp`.

## Data model

**SpanStore** is an in-memory ring buffer of finished spans (default 500) with pub/sub and prefix filtering, fed by **SpanStoreProcessor** on span end. The frontend devtools and CDC debug logging read it.

## Health endpoints

| Service | Endpoint | Response |
| --- | --- | --- |
| Backend | `GET /health` | Full diagnostics: status, uptime, database, CDC health, memory |
| CDC | `GET /health` | Status, uptime, replication state, WebSocket connection, circuit breakers |
| YJS | `GET /health` | Status, uptime, connection/document/client counts |

All default to **shallow** 204 for load balancers and liveness probes. `?depth=full` returns JSON. Backend health is `unhealthy` when the database probe fails and `degraded` on lesser component trouble such as event-loop lag. CDC is `degraded` when replication is paused or the WebSocket is disconnected, `unhealthy` when replication is stopped or WAL lag passes its limit.
