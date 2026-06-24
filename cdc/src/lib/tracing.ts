/**
 * CDC Worker tracing module.
 *
 * Uses real OTel tracer via the shared factory.
 * SpanStoreProcessor bridges spans to pino debug logging.
 */

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { appConfig } from 'shared';
import { createOtelSDK, type OtelSDK } from 'shared/otel';
import {
  activityAttrs,
  cdcAttrs,
  cdcSpanNames,
  createSpanStoreProcessor,
  type TraceContext,
} from 'shared/tracing';
import { env } from '../env';
import { logEvent } from './pino';

// Re-export span names and attribute helpers from shared package
export { activityAttrs, cdcAttrs, cdcSpanNames };
export type { TraceContext };

// ================================
// OTel SDK
// ================================

const debugProcessor = createSpanStoreProcessor({
  onSpanEnd: (span) => {
    logEvent('trace', `Span: ${span.name}`, {
      traceId: span.traceId,
      duration: `${span.duration}ms`,
      status: span.status,
      ...span.attributes,
    });
  },
});

export const otel: OtelSDK = createOtelSDK({
  serviceName: `${appConfig.slug}-cdc`,
  mapleSecretIngestKey: env.MAPLE_SECRET_INGEST_KEY,
  autoInstrumentations: false,
  spanProcessors: [debugProcessor],
});

// ================================
// OTel Health Metrics
// ================================

const meter = otel.meterProvider.getMeter('cdc-health');

meter.createObservableGauge('cdc.ws.connected', {
  description: 'Whether CDC is connected to backend WebSocket (0/1)',
}).addCallback(async (result) => {
  const { wsClient } = await import('../network/websocket-client');
  result.observe(wsClient.isConnected() ? 1 : 0);
});

meter.createObservableGauge('cdc.ws.messages_sent', {
  description: 'Total messages sent to backend via WebSocket',
}).addCallback(async (result) => {
  const { wsClient } = await import('../network/websocket-client');
  result.observe(wsClient.messagesSent);
});

meter.createObservableGauge('cdc.circuit_breaker.open_count', {
  description: 'Number of open/half-open circuit breakers',
}).addCallback(async (result) => {
  const { circuitBreaker } = await import('../services/circuit-breaker');
  const status = circuitBreaker.getStatus();
  const openCount = Object.values(status).filter((s) => s.state !== 'closed').length;
  result.observe(openCount);
});

meter.createObservableGauge('cdc.replication.status', {
  description: 'Replication status (0=stopped, 1=paused, 2=active)',
}).addCallback(async (result) => {
  const { replicationState } = await import('../services/replication-state');
  const statusMap = { stopped: 0, paused: 1, active: 2 } as const;
  result.observe(statusMap[replicationState.status]);
});

// ================================
// OTel Tracer + withSpan
// ================================

const tracer = trace.getTracer(`${appConfig.name}-cdc`);

interface SpanAttrs {
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Execute an async function within a traced CDC span.
 * Returns W3C-format traceId/spanId for _trace propagation.
 */
export async function withSpan<T>(
  name: string,
  attrs: SpanAttrs,
  fn: (ctx: TraceContext) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    for (const [key, value] of Object.entries(attrs)) {
      if (value !== undefined && value !== null) {
        span.setAttribute(key, value);
      }
    }
    try {
      const ctx: TraceContext = {
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
        cdcTimestamp: Date.now(),
        lsn: (attrs.lsn as string) ?? undefined,
      };
      const result = await fn(ctx);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  });
}
