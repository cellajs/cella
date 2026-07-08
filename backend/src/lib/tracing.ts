import { appConfig } from 'shared';
import { createOtelSDK, type OtelSDK } from 'shared/otel';
import { env } from '#/env';

/** Backend OTel SDK configured with the shared factory and Maple.dev exporter key. */
export const otel: OtelSDK = createOtelSDK({
  serviceName: `${appConfig.slug}-api`,
  mapleSecretIngestKey: env.MAPLE_SECRET_INGEST_KEY,
});
