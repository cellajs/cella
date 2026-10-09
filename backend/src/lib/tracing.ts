import { appConfig } from 'shared';
import { createOtelSDK, type OtelSDK } from 'shared/otel';
import { env } from '#/env';

/** Every backend MODE shares the image; traces, metrics and logs name the process they came from. */
export const serviceName = `${appConfig.slug}-${env.MODE}`;

/** Backend OTel SDK configured with the shared factory and Maple.dev exporter key. */
export const otel: OtelSDK = createOtelSDK({
  serviceName,
  serviceVersion: env.RELEASE_SHA,
  mapleSecretIngestKey: env.MAPLE_SECRET_INGEST_KEY,
});
