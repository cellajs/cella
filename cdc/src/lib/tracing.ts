import { SpanStatusCode, trace } from '@opentelemetry/api';
import { appConfig } from 'shared';
import { createOtelSDK, type OtelSDK } from 'shared/otel';
import { resolveOtlpSink } from 'shared/otlp-sink';
import { activityAttrs, cdcAttrs, cdcSpanNames, createSpanStoreProcessor, type TraceContext } from 'shared/tracing';
import { env } from '../env';
import { log } from './pino';

export type { TraceContext };
export { activityAttrs, cdcAttrs, cdcSpanNames };

// OTel SDK

const debugProcessor = createSpanStoreProcessor({
  onSpanEnd: (span) => {
    log.trace(`Span: ${span.name}`, { traceId: span.traceId, duration: `${span.duration}ms`, status: span.status, ...span.attributes });
  },
});

/** SpanStoreProcessor bridges spans to pino debug logging. */
export const otel: OtelSDK = createOtelSDK({
  serviceName: `${appConfig.slug}-cdc`,
  serviceVersion: env.RELEASE_SHA,
  sink: resolveOtlpSink(env),
  autoInstrumentations: false,
  spanProcessors: [debugProcessor],
});

// OTel health metrics

const meter = otel.meterProvider.getMeter('cdc-health');

meter
  .createObservableGauge('cdc.ws.connected', { description: 'Whether CDC is connected to backend WebSocket (0/1)' })
  .addCallback(async (result) => {
    const { wsClient } = await import('../network/websocket-client');
    result.observe(wsClient.isConnected() ? 1 : 0);
  });

meter
  .createObservableGauge('cdc.ws.messages_sent', {
    description: 'Total messages sent to backend via WebSocket',
  })
  .addCallback(async (result) => {
    const { wsClient } = await import('../network/websocket-client');
    result.observe(wsClient.messagesSent);
  });

meter
  .createObservableGauge('cdc.replication.failures_at_position', { description: 'Failures in a row at the position the worker reads again from' })
  .addCallback(async (result) => {
    const { replicationState } = await import('../services/replication-state');
    result.observe(replicationState.failure?.count ?? 0);
  });

meter
  .createObservableGauge('cdc.replication.status', { description: 'Replication status (0=stopped, 1=paused, 2=active)' })
  .addCallback(async (result) => {
    const { replicationState } = await import('../services/replication-state');
    const statusMap = { stopped: 0, paused: 1, active: 2 } as const;
    result.observe(statusMap[replicationState.status]);
  });

// OTel tracer + withSpan

const tracer = trace.getTracer(`${appConfig.name}-cdc`);

interface SpanAttrs {
  [key: string]: string | number | boolean | null | undefined;
}

/** Runs `fn` in a CDC span and hands it W3C traceId/spanId for `_trace` propagation. */
export async function withSpan<T>(name: string, attrs: SpanAttrs, fn: (ctx: TraceContext) => Promise<T>): Promise<T> {
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
