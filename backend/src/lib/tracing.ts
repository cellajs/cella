import { appConfig } from 'shared';
import { createOtelSDK, type OtelSDK } from 'shared/otel';
import { resolveOtlpSink } from 'shared/otlp-sink';
import { env } from '#/env';

/** Every backend MODE shares the image; traces, metrics and logs name the process they came from. */
export const serviceName = `${appConfig.slug}-${env.MODE}`;

/** Where this process exports telemetry; the SDK and the loggers share it. */
export const otlpSink = resolveOtlpSink(env);

/** Backend OTel SDK from the shared factory. */
export const otel: OtelSDK = createOtelSDK({ serviceName, serviceVersion: env.RELEASE_SHA, sink: otlpSink });
