import { createOtelSDK, type OtelSDK } from 'shared/otel';
import { env } from '#/env';
import { otlpSink, serviceName } from '#/lib/otel-env';

/** Backend OTel SDK from the shared factory. */
export const otel: OtelSDK = createOtelSDK({ serviceName, serviceVersion: env.RELEASE_SHA, sink: otlpSink });
