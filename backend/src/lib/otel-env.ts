import { appConfig } from 'shared';
import { resolveOtlpSink } from 'shared/otlp-sink';
import { env } from '#/env';

/** Every backend MODE shares the image; traces, metrics and logs name the process they came from. */
export const serviceName = `${appConfig.slug}-${env.MODE}`;

/** Where this process exports telemetry; the SDK and the loggers share it. */
export const otlpSink = resolveOtlpSink(env);
