import { appConfig } from 'shared';
import { createOtelSDK, type OtelSDK } from 'shared/otel';
import { env } from '../env';

/** OTel SDK for the Yjs worker, built from the shared factory (traces/metrics/logs). */
export const otel: OtelSDK = createOtelSDK({
  serviceName: `${appConfig.slug}-yjs`,
  mapleSecretIngestKey: env.MAPLE_SECRET_INGEST_KEY,
  autoInstrumentations: false,
});

// ================================
// OTel Health Metrics
// ================================

const meter = otel.meterProvider.getMeter('yjs-health');

meter.createObservableGauge('yjs.connections.active', {
  description: 'Active WebSocket connections to YJS server',
}).addCallback(async (result) => {
  const { getConnectionCount } = await import('../server/ws-server');
  result.observe(getConnectionCount());
});

meter.createObservableGauge('yjs.documents.active', {
  description: 'Active collaborative document sessions',
}).addCallback(async (result) => {
  const { getActiveDocumentCount } = await import('../sync/session-manager');
  result.observe(getActiveDocumentCount());
});

meter.createObservableGauge('yjs.clients.active', {
  description: 'Total clients across all document sessions',
}).addCallback(async (result) => {
  const { getActiveClientCount } = await import('../sync/session-manager');
  result.observe(getActiveClientCount());
});
