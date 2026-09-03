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
                    shared/otel.ts
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
| Backend | `{appName}-api` | Yes (HTTP, DB) | `withSpan()`, `startSyncSpan()` | 5 sync instruments | No |
| CDC | `{appName}-cdc` | No | `withSpan()` + `_trace` propagation | 4 observable gauges | Yes (→ pino debug) |
| YJS | `{appName}-yjs` | No | None currently | 3 observable gauges | No |
| Frontend | `{appName}-frontend` | Fetch only | Via `FetchInstrumentation` | None | Yes (→ devtools) |

The frontend has no secret ingest key (no secrets in browser bundles); `maplePublicIngestKey` in `appConfig` is safe to bundle and exports browser telemetry directly to Maple.

### HTTP semantic conventions

Backend auto-instrumentation emits the **stable** OTel HTTP attributes (`http.request.method`, `http.response.status_code`, `url.full`, `server.address`, `user_agent.original`, …), not the legacy `http.*` keys: the shared factory sets `OTEL_SEMCONV_STABILITY_OPT_IN=http` (via `??=`) before `getNodeAutoInstrumentations()`. Set `OTEL_SEMCONV_STABILITY_OPT_IN=http/dup` to emit both key sets during a migration; an explicit value wins.

## Add a worker

Every worker needs OTel setup, logging, graceful shutdown, and, if it serves HTTP, a health endpoint; CDC is the reference:

| File | Role | What to know |
| --- | --- | --- |
| [tracing.ts](../cdc/src/lib/tracing.ts) | `createOtelSDK()` from `shared/otel`: `serviceName` (`appConfig.slug` plus worker suffix), `mapleSecretIngestKey: env.MAPLE_SECRET_INGEST_KEY`, `autoInstrumentations: false` | `autoInstrumentations: true` only for HTTP servers; add a `SpanStoreProcessor` to `spanProcessors` for local span debugging. |
| [pino.ts](../cdc/src/lib/pino.ts) | `createWorkerLog('<worker>', env)` from `shared/pino`, which calls `createLogger()` with `enableOtelTransport: true` and the same key and service name | With a key, logs also ship to Maple via `pino-opentelemetry-transport` in dev and production alike; the console keeps `pino-pretty` in dev and raw JSON in production. |
| [index.ts](../cdc/src/index.ts) | `otel.start()`, then `setupGracefulShutdown({ name, log, cleanup })` from `shared/utils/worker-lifecycle` | `cleanup` closes servers and connections and awaits `otel.shutdown()`; handles SIGINT/SIGTERM, double-signal force exit, a timeout (default 10s), and uncaught exceptions. |

### Health endpoint (if HTTP)

Serve `createHealthApp({ version, full })` from `shared/health-app`: `GET /health` returns 204; `?depth=full` returns `full()` as JSON with at least `status` and `uptime`.

### Metrics

Add observable gauges for key runtime state:

```typescript
const meter = otel.meterProvider.getMeter("myworker-health");

meter
  .createObservableGauge("myworker.connections.active", {
    description: "Active connections",
  })
  .addCallback((result) => {
    result.observe(getConnectionCount());
  });
```

## Add tracing

### Manual spans

Use `@opentelemetry/api` directly in any service with OTel initialized:

```typescript
import { trace, SpanStatusCode } from "@opentelemetry/api";

const tracer = trace.getTracer("my-module");

async function doWork() {
  return tracer.startActiveSpan("my.operation", async (span) => {
    span.setAttribute("key", "value");
    try {
      const result = await actualWork();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      span.recordException(
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    } finally {
      span.end();
    }
  });
}
```

CDC wraps this in a `withSpan()` helper returning `{ traceId, spanId }` for trace propagation ([cdc/src/lib/tracing.ts](../cdc/src/lib/tracing.ts)).

### Span names and attributes

Span names are constants in [span-names.ts](../shared/src/tracing/span-names.ts), grouped by service prefix (`cdc.*`, `sync.*`); never inline strings. The shared tracing module also exports attribute builders (`cdcAttrs`, `activityAttrs`, `eventAttrs`); add a helper when a group of spans shares attributes.

### Custom metrics

Use the `MeterProvider` from your service's `otel` export: observable gauges for runtime state, counters and histograms for request-scoped measurements (see the backend sync-metrics module).

## Trace correlation

1. **Frontend**: `FetchInstrumentation` injects `traceparent` on API calls.
2. **Backend**: auto-instrumentation picks up `traceparent` and creates child spans.
3. **CDC**: stamps `_trace` (`traceId`, `spanId`, `cdcTimestamp`) on activity payloads sent to the backend over WebSocket.
4. **Backend → Frontend**: SSE notifications carry `_trace`; the frontend computes `e2e_latency_ms = now - cdcTimestamp`.

## Data model

**SpanData**: the shared span object with `traceId`, `spanId`, `name`, `startTime`, `endTime`, `duration`, `attributes`, `status`, `events`, and optional `parentSpanId`. **SpanStore**: an in-memory ring buffer (default 500 spans) with pub/sub, prefix filtering, and statistics, used by the frontend devtools and CDC debug logging. **SpanStoreProcessor**: an OTel `SpanProcessor` that converts `ReadableSpan` → `SpanData` on `onEnd` into the `SpanStore`.

## Health endpoints

| Service | Endpoint | Response |
| --- | --- | --- |
| Backend | `GET /health` | Full diagnostics: status, uptime, database, CDC health, memory |
| CDC | `GET /health` | Status, uptime, replication state, WebSocket connection, circuit breakers |
| YJS | `GET /health` | Status, uptime, connection/document/client counts |

All default to **shallow** 204 for load balancers and liveness probes; `?depth=full` returns JSON. Backend health is `degraded` when CDC reports stale connections and `unhealthy` when the database probe fails; CDC is degraded when replication is paused or the WebSocket is disconnected, `unhealthy` when replication is stopped.
