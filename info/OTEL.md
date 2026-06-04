# Observability

Cella uses [OpenTelemetry](https://opentelemetry.io/) (OTel) for all three observability pillars: **traces**, **metrics**, and **logs**. [Maple.dev](https://maple.dev) is the default telemetry backend. Each service wires up OTel identically via a shared factory, keeping configuration in one place.

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
|---------|-------------|---------------------|-------|---------|-----------|
| Backend | `{appName}-api` | Yes (HTTP, DB) | `withSpan()`, `startSyncSpan()` | 5 sync instruments | No |
| CDC | `{appName}-cdc` | No | `withSpan()` + `_trace` propagation | 4 observable gauges | Yes (→ pino debug) |
| YJS | `{appName}-yjs` | No | None currently | 3 observable gauges | No |
| Frontend | `{appName}-frontend` | Fetch only | Via `FetchInstrumentation` | None | Yes (→ devtools) |

The frontend cannot export to Maple (no API keys in browser bundles), so it uses `SpanStoreProcessor` for devtools and `FetchInstrumentation` to inject `traceparent` headers for cross-service correlation.

Each service has a `tracing.ts` (or `otel.ts` for frontend) that calls the shared factory. Look at the CDC or YJS worker for the most complete examples.

## How to add a new worker

Every new Node.js worker needs four things: OTel setup, logging, graceful shutdown, and optionally a health endpoint. Follow these steps:

### 1. OTel setup (`tracing.ts`)

```typescript
import { appConfig } from 'shared';
import { createOtelSDK, type OtelSDK } from 'shared/otel';
import { env } from './env';

export const otel: OtelSDK = createOtelSDK({
  serviceName: `${appConfig.name}-myworker`,
  mapleApiKey: env.MAPLE_API_KEY,
  autoInstrumentations: false, // true only for HTTP servers
});
```

To add local span debugging, pass a `SpanStoreProcessor` (see how CDC does it).

### 2. Logging (`pino.ts`)

```typescript
import { createLogger } from 'shared/pino';

export const log = createLogger({ name: 'myworker' });
```

In production, Pino automatically ships logs to Maple via `pino-opentelemetry-transport`. In dev it uses `pino-pretty`.

### 3. Graceful shutdown

In your entry point (`index.ts`), wire up lifecycle management:

```typescript
import { setupGracefulShutdown } from 'shared/utils/worker-lifecycle';
import { otel } from './tracing';
import { log } from './pino';

setupGracefulShutdown({
  name: 'myworker',
  log,
  cleanup: async () => {
    // Close connections, flush buffers, etc.
    await otel.shutdown();
  },
});

otel.start();
```

This handles SIGINT/SIGTERM, double-signal force exit, configurable timeout (default 10s), and uncaught exceptions.

### 4. Health endpoint (if HTTP)

If your worker exposes an HTTP server, add a `GET /health` route. The default (no query params) should return 204 No Content for lightweight liveness probes. Support `?depth=full` for JSON diagnostics with at least `status` and `uptime`. See the backend or CDC health handlers for reference.

### 5. Metrics

Add observable gauges for key runtime state:

```typescript
const meter = otel.meterProvider.getMeter('myworker-health');

meter.createObservableGauge('myworker.connections.active', {
  description: 'Active connections',
}).addCallback((result) => {
  result.observe(getConnectionCount());
});
```

## How to add tracing to existing functionality

### Manual spans

Use `@opentelemetry/api` directly to create spans in any service that has OTel initialized:

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('my-module');

async function doWork() {
  return tracer.startActiveSpan('my.operation', async (span) => {
    span.setAttribute('key', 'value');
    try {
      const result = await actualWork();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  });
}
```

For services that need trace context propagation (like CDC), wrap this pattern in a `withSpan()` helper that returns `{ traceId, spanId }` — see the CDC worker's implementation.

### Span naming conventions

Span names are centralized as constants in the shared tracing module, grouped by service prefix (`cdc.*`, `sync.*`). Always add new span names there rather than using inline strings. This avoids typos and makes span names easy to search and rename.

### Attribute helpers

The shared tracing module exports attribute builder functions (`cdcAttrs`, `activityAttrs`, `eventAttrs`) that produce consistent attribute objects. Add new helpers there when a group of spans needs the same attributes.

### Custom metrics

Use the `MeterProvider` from your service's `otel` export. Observable gauges work well for runtime state; counters and histograms work for request-scoped measurements. See the backend sync-metrics module for counter/histogram examples.

## Cross-service trace correlation

The trace flow across services:

1. **Frontend** → `FetchInstrumentation` auto-injects `traceparent` header on API calls
2. **Backend** → OTel auto-instrumentation picks up `traceparent`, creating child spans under the frontend trace
3. **CDC** → stamps `_trace` (containing `traceId`, `spanId`, `cdcTimestamp`) on activity payloads sent to backend via WebSocket
4. **Backend → Frontend** → SSE notifications carry `_trace`, frontend calculates `e2e_latency_ms = now - cdcTimestamp`

This gives full end-to-end visibility from user action → API → database → CDC → SSE → client, all correlated under a single trace.

## Tracing data model

**SpanData** is the shared span representation — a plain object with `traceId`, `spanId`, `name`, `startTime`, `endTime`, `duration`, `attributes`, `status`, `events`, and optional `parentSpanId`.

**SpanStore** is an in-memory ring buffer (default 500 spans) with pub/sub, filtering by prefix, and statistics. Used by the frontend devtools and CDC debug logging.

**SpanStoreProcessor** bridges real OTel spans to the `SpanStore`. It implements OTel's `SpanProcessor` interface and converts `ReadableSpan` → `SpanData` on `onEnd`.

## Health endpoints

| Service | Endpoint | Response |
|---------|----------|----------|
| Backend | `GET /health` | Full diagnostics: status, uptime, database, CDC health, memory |
| CDC | `GET /health` | Status, uptime, replication state, WebSocket connection, circuit breakers |
| YJS | `GET /health` | Status, uptime, connection/document/client counts |

All health endpoints default to **shallow** (204 No Content) — safe for load balancers, container orchestrators, and liveness probes without extra configuration. Use `?depth=full` to get JSON diagnostics.

Backend health degrades to `degraded` if CDC reports stale connections, and to `unhealthy` if the database probe fails. CDC health degrades if replication is paused or the WebSocket is disconnected, and becomes `unhealthy` if replication is stopped.
