import pino from 'pino';
import { appConfig } from './config-builder/app-config';
import type { Severity } from '../types';

export type { Logger } from 'pino';

// Maple.dev OTLP logs ingest endpoint (kept in sync with MAPLE_INGEST_BASE in ./otel.ts).
const MAPLE_LOGS_INGEST_URL = 'https://ingest.maple.dev/v1/logs';

interface CreateLoggerOptions {
  level?: string;
  isProduction: boolean;
  isTest: boolean;
  redact?: pino.LoggerOptions['redact'];
  formatters?: pino.LoggerOptions['formatters'];
  transportOptions?: Record<string, unknown>;
  /** When true (and a `mapleSecretIngestKey` is set), ships structured logs to Maple.dev via pino-opentelemetry-transport — in dev and production alike, alongside the console output. */
  enableOtelTransport?: boolean;
  /** Maple.dev secret ingest key. Without it the OTel transport is skipped. */
  mapleSecretIngestKey?: string;
  /** Reported as `service.name` in the OTel resource for exported logs (should match the service's tracing serviceName). */
  serviceName?: string;
}

export const createLogger = ({
  level,
  isProduction,
  isTest,
  redact,
  formatters,
  transportOptions,
  enableOtelTransport,
  mapleSecretIngestKey,
  serviceName,
}: CreateLoggerOptions): pino.Logger => {
  // Console target: human-readable pretty in dev, raw JSON on stdout in production/containers.
  const consoleTarget: pino.TransportTargetOptions = isProduction
    ? { target: 'pino/file', options: { destination: 1 } }
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          singleLine: true,
          ignore: 'pid,hostname',
          ...transportOptions,
        },
      };

  // Maple target. pino-opentelemetry-transport runs in a worker thread with its own OTLP exporter,
  // so it must be handed the endpoint + ingest key explicitly. Enabled in dev too, so logs reach
  // Maple in the same structured shape as production while the console still shows pretty output.
  const otelTarget: pino.TransportTargetOptions | undefined =
    !isTest && enableOtelTransport && mapleSecretIngestKey
      ? {
          target: 'pino-opentelemetry-transport',
          options: {
            resourceAttributes: {
              ...(serviceName && { 'service.name': serviceName }),
              // OTel semantic convention: deploy environment (development/staging/production/…).
              'deployment.environment.name': appConfig.mode,
            },
            logRecordProcessorOptions: {
              recordProcessorType: 'batch',
              exporterOptions: {
                protocol: 'http',
                httpExporterOptions: {
                  url: MAPLE_LOGS_INGEST_URL,
                  headers: { 'x-maple-ingest-key': mapleSecretIngestKey },
                },
              },
            },
          },
        }
      : undefined;

  // With OTel on, fan out to console + Maple. Otherwise keep the simple path:
  // raw stdout in production (no worker thread), pretty transport in dev.
  const destination = otelTarget
    ? pino.transport({ targets: [consoleTarget, otelTarget] })
    : isProduction
      ? undefined
      : pino.transport(consoleTarget);

  return pino(
    {
      level: level ?? (isTest ? 'silent' : 'info'),
      formatters: {
        // Keep `level` numeric (10–60) when exporting to OTel so pino-opentelemetry-transport can
        // map it to an OTel severity; otherwise stringify it for nicer human-facing JSON.
        ...(!otelTarget && { level: (label) => ({ level: label.toUpperCase() }) }),
        ...formatters,
      },
      ...(redact && { redact }),
    },
    destination,
  );
};

export const createLogHelpers = (logger: pino.Logger, isProduction: boolean) => ({
  logEvent: (severity: Severity, msg: string, meta?: object): void => {
    logger[severity]({ ...(meta ?? {}), msg });
  },
  logError: (msg: string, error: unknown): void => {
    if (!isProduction && error instanceof Error) logger.error(error, msg);
    else logger.error({ error: error instanceof Error ? error.message : String(error), msg });
  },
});
