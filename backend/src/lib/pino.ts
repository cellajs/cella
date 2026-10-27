import { appConfig } from 'shared';
import { createLog, createLogger } from 'shared/pino';
import { env } from '#/env';
import { otlpSink, serviceName } from '#/lib/otel-env';
import { redactPaths } from '#/lib/redact-keys';

// NODE_ENV=production in containers disables pino-pretty.
const isProduction = appConfig.mode === 'production' || env.NODE_ENV === 'production';
const isTest = appConfig.mode === 'test';

/** Censored in every backend log line: secret columns and transport keys, plus the auth headers of a logged request. */
export const backendRedactPaths = [...redactPaths, 'req.headers.authorization', 'req.headers.cookie'];

/** What both loggers share: a level, sink or redaction list set here reaches each. */
const loggerOptions = {
  level: env.PINO_LOG_LEVEL,
  isProduction,
  isTest,
  sink: otlpSink,
  serviceName,
  serviceVersion: env.RELEASE_SHA,
  redactPaths: backendRedactPaths,
};

/** Request logger: pino-pretty via messageFormat in dev, JSON to stdout in production, the OTLP sink when one is set. */
export const requestLogger = createLogger({
  ...loggerOptions,
  transportOptions: {
    colorize: false,
    singleLine: false,
    ignore: 'pid,hostname,level',
    messageFormat: '{method} {status} {url} ({responseTime}ms) @{userId}',
    hideObject: true,
  },
});

/**
 * The context-free log facade, the only way to the event logger, so every line keeps the `err` convention. Code that
 * runs in a request or a job uses `log` from #/utils/logger, which adds the ambient ids.
 */
export const baseLog = createLog(createLogger(loggerOptions));
