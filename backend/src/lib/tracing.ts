/**
 * Backend OTel setup.
 *
 * Uses the shared factory for Maple.dev exporters.
 * Exports the raw OtelSDK object (consistent with CDC/YJS).
 */

import { appConfig } from 'shared';
import { createOtelSDK, type OtelSDK } from 'shared/otel';
import { env } from '#/env';

export const otel: OtelSDK = createOtelSDK({
  serviceName: `${appConfig.slug}-api`,
  mapleSecretIngestKey: env.MAPLE_SECRET_INGEST_KEY,
});
