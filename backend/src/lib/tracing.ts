import { appConfig } from 'shared';
import { createOtelSDK, type OtelSDK } from 'shared/otel';
import { env } from '#/env';

/** Backend OTel SDK configured with the shared factory and Maple.dev exporter key. */
export const otel: OtelSDK = createOtelSDK({
  // Every backend MODE shares the image; traces name the process they came from.
  serviceName: `${appConfig.slug}-${env.MODE}`,
  mapleSecretIngestKey: env.MAPLE_SECRET_INGEST_KEY,
});
