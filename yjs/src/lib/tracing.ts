import { appConfig } from 'shared';
import { createOtelSDK, type OtelSDK } from 'shared/otel';
import { resolveOtlpSink } from 'shared/otlp-sink';
import { env } from '../env';

/** OTel SDK for the Yjs worker, built from the shared factory (traces/metrics/logs). */
export const otel: OtelSDK = createOtelSDK({
  serviceName: `${appConfig.slug}-yjs`,
  serviceVersion: env.RELEASE_SHA,
  sink: resolveOtlpSink(env),
  autoInstrumentations: false,
});

// OTel health metrics

const meter = otel.meterProvider.getMeter('yjs-health');

meter
  .createObservableGauge('yjs.connections.active', { description: 'Active WebSocket connections to YJS server', unit: '{connection}' })
  .addCallback(async (result) => {
    const { getConnectionCount } = await import('../server/ws-server');
    result.observe(getConnectionCount());
  });

meter
  .createObservableGauge('yjs.documents.active', { description: 'Active collaborative document sessions', unit: '{document}' })
  .addCallback(async (result) => {
    const { getActiveDocumentCount } = await import('../sync/session-manager');
    result.observe(getActiveDocumentCount());
  });

meter
  .createObservableGauge('yjs.clients.active', { description: 'Total clients across all document sessions', unit: '{client}' })
  .addCallback(async (result) => {
    const { getActiveClientCount } = await import('../sync/session-manager');
    result.observe(getActiveClientCount());
  });
