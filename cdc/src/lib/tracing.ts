import { SpanStatusCode, trace } from '@opentelemetry/api';
import { appConfig } from 'shared';
import { createOtelSDK, type OtelSDK } from 'shared/otel';
import { resolveOtlpSink } from 'shared/otlp-sink';
import { type CleanSpanAttributes, createSpanStoreProcessor, type TraceContext } from 'shared/tracing';
import { env } from '../env';
import { log } from './pino';

/** Bridges every finished span to a pino trace line. */
const debugProcessor = createSpanStoreProcessor({
  onSpanEnd: (span) => {
    log.trace(`Span: ${span.name}`, { traceId: span.traceId, duration: `${span.duration}ms`, status: span.status, ...span.attributes });
  },
});

/** The worker's OTel SDK: traces and metrics of the service `<slug>-cdc`. */
export const otel: OtelSDK = createOtelSDK({
  serviceName: `${appConfig.slug}-cdc`,
  serviceVersion: env.RELEASE_SHA,
  sink: resolveOtlpSink(env),
  autoInstrumentations: false,
  spanProcessors: [debugProcessor],
});

/** The value `cdc.replication.status` reports for each status. */
const replicationStatusValues = { stopped: 0, paused: 1, active: 2 } as const;

/** The worker's health gauges and counters, observed at every export. */
const meter = otel.meterProvider.getMeter('cdc-health');

meter
  .createObservableGauge('cdc.ws.connected', { description: 'Whether CDC is connected to backend WebSocket (0/1)' })
  .addCallback(async (result) => {
    const { wsClient } = await import('../network/websocket-client');
    result.observe(wsClient.isConnected() ? 1 : 0);
  });

meter
  .createObservableCounter('cdc.ws.messages_sent', { description: 'Total messages sent to backend via WebSocket', unit: '{message}' })
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
    const { replicationStatus } = await import('../services/replication-status');
    result.observe(replicationStatusValues[replicationStatus()]);
  });

const tracer = trace.getTracer(`${appConfig.slug}-cdc`);

/** Runs `fn` in a CDC span and hands it that span's W3C context for `_trace`, which the API continues the trace from. */
export async function withSpan<T>(name: string, attrs: CleanSpanAttributes, fn: (traceContext: TraceContext) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    for (const [key, value] of Object.entries(attrs)) {
      if (value !== null) span.setAttribute(key, value);
    }
    try {
      const { traceId, spanId, traceFlags } = span.spanContext();
      const lsn = attrs['cdc.lsn'];
      const traceContext: TraceContext = { traceId, spanId, traceFlags, cdcTimestamp: Date.now(), lsn: typeof lsn === 'string' ? lsn : undefined };
      const result = await fn(traceContext);
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
