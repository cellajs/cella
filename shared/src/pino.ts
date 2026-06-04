import pino from 'pino';
import type { Severity } from '../types';

export type { Logger } from 'pino';

interface CreateLoggerOptions {
  level?: string;
  isProduction: boolean;
  isTest: boolean;
  redact?: pino.LoggerOptions['redact'];
  formatters?: pino.LoggerOptions['formatters'];
  transportOptions?: Record<string, unknown>;
  /** When true, bridges pino logs to OpenTelemetry Logs API in production (requires a registered LoggerProvider). */
  enableOtelTransport?: boolean;
}

export const createLogger = ({ level, isProduction, isTest, redact, formatters, transportOptions, enableOtelTransport }: CreateLoggerOptions): pino.Logger => {
  const destination = isProduction
    ? enableOtelTransport
      ? pino.transport({
          targets: [
            { target: 'pino/file', options: { destination: 1 } },
            { target: 'pino-opentelemetry-transport' },
          ],
        })
      : undefined
    : pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          singleLine: true,
          ignore: 'pid,hostname',
          ...transportOptions,
        },
      });

  return pino(
    {
      level: level ?? (isTest ? 'silent' : 'info'),
      formatters: {
        level: (label) => ({ level: label.toUpperCase() }),
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
