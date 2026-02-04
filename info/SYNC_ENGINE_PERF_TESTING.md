# Sync engine performance testing plan

This document outlines the performance testing strategy for Cella's hybrid sync engine, extending the existing OpenTelemetry instrumentation.

## Current instrumentation

Cella already has OTel infrastructure in place:

| Component | Location | Purpose |
|-----------|----------|---------|
| **NodeSDK** | `backend/src/tracing.ts` | Trace and metric collection |
| **HTTP spans** | `@hono/otel` middleware | Route-aware request tracing |
| **Sync spans** | `backend/src/sync/sync-metrics.ts` | ActivityBus, SSE, CDC tracing |
| **Sync metrics** | `sync-metrics.ts` counters/histograms | Event counts, connection counts, catch-up duration |
| **Runtime metrics** | `RuntimeNodeInstrumentation` | Event loop, GC, heap |

### Existing sync metrics

```typescript
// Already tracking in sync-metrics.ts:
cdcEventsReceived      // Counter: events from CDC Worker
sseEventsEmitted       // Counter: events to SSE streams
sseActiveConnections   // UpDownCounter: active SSE connections
sseCatchUpDuration     // Histogram: catch-up phase duration
pgNotifyFallback       // Counter: pg_notify fallback usage
```

---

## Extension plan

### Phase 1: Add missing sync spans

Extend `sync-metrics.ts` with spans for key sync operations:

| Span name | Trigger | Attributes |
|-----------|---------|------------|
| `sync.mutation.roundtrip` | Mutation start → server ACK | `entityType`, `action`, `duration_ms` |
| `sync.stream.reconnect` | SSE disconnect → connected | `gap_detected`, `catchup_count` |
| `sync.queue.flush` | Offline → online flush | `mutation_count`, `conflict_count` |
| `sync.broadcast.leader` | Leader → follower broadcast | `tab_count`, `latency_ms` |

### Phase 2: Frontend tracing

Add lightweight frontend spans (no full OTel SDK to keep bundle small):

```typescript
// frontend/src/lib/perf-trace.ts
export function traceSync(name: string, fn: () => Promise<void>) {
  const start = performance.now();
  return fn().finally(() => {
    const duration = performance.now() - start;
    // Send to /metrics endpoint or console.debug
    if (import.meta.env.DEV) {
      console.debug(`[perf] ${name}: ${duration.toFixed(1)}ms`);
    }
  });
}
```

### Phase 3: Metrics endpoint extension

Extend `/metrics` to expose sync-specific data:

```typescript
// Add to metrics-handlers.ts response:
sync: {
  cdcEventsReceived: number,
  sseEventsEmitted: number,
  sseActiveConnections: number,
  avgCatchUpDuration: number,
}
```

---

## Testing approach

### Integration tests with metrics assertions

Use existing Vitest infrastructure to assert on metrics after operations:

```typescript
// backend/tests/sync/sync-perf.test.ts
import { getSyncMetrics } from '#/sync/sync-metrics';

test('SSE catch-up completes within threshold', async () => {
  // Seed 100 activities
  await seedActivities(100);
  
  // Connect SSE client
  const client = await connectSSE();
  await client.waitForCatchUp();
  
  // Assert on histogram
  const metrics = getSyncMetrics();
  expect(metrics.catchUpDuration.p95).toBeLessThan(500); // 500ms threshold
});
```

### Load testing with k6

For production-like load testing, use k6 with the metrics endpoint:

```javascript
// k6/sync-load.js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 50,
  duration: '5m',
};

export default function () {
  // Simulate SSE connections and mutations
  const res = http.get('http://localhost:3000/me/stream');
  check(res, { 'SSE connected': (r) => r.status === 200 });
}
```

---

## Key metrics to track

| Metric | Target | Alert threshold |
|--------|--------|-----------------|
| Mutation round-trip (p95) | < 100ms | > 500ms |
| SSE catch-up (p95) | < 500ms | > 2s |
| Offline queue flush (100 items) | < 5s | > 15s |
| Leader broadcast latency | < 50ms | > 200ms |
| Memory per 1000 entities | < 50MB | > 100MB |

---

## Running performance checks

```bash
# View current sync metrics
curl http://localhost:3000/api/metrics | jq '.sync'

# Run sync integration tests
pnpm test backend/tests/sync/

# Check OTel spans (console output in dev)
DEV_MODE=core pnpm dev  # Spans logged to console
```

---

## Notes

- OTel spans are logged to console in dev via `ConsoleSpanExporter`
- For production, configure an OTel collector endpoint
- Frontend tracing is intentionally lightweight to avoid bundle bloat
- Histogram buckets for `sseCatchUpDuration` may need tuning based on observed distributions
