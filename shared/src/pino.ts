import { trace } from '@opentelemetry/api';
import pino from 'pino';
import type { Severity } from '../types.ts';
import { appConfig } from './config-builder/app-config.ts';
import { failedQueryReason, isFailedQueryMessage, redactFailedQuery } from './utils/failed-query.ts';
import { scrubUrl } from './utils/scrub-url.ts';

export type { Logger } from 'pino';

// Maple.dev OTLP logs ingest endpoint (kept in sync with MAPLE_INGEST_BASE in ./otel.ts).
const MAPLE_LOGS_INGEST_URL = 'https://ingest.maple.dev/v1/logs';

interface CreateLoggerOptions {
  level?: string;
  isProduction: boolean;
  isTest: boolean;
  /** Keys censored in every line (fast-redact paths): secret columns and transport keys. Required, so no logger skips it. */
  redactPaths: readonly string[];
  formatters?: pino.LoggerOptions['formatters'];
  transportOptions?: Record<string, unknown>;
  /** With a `mapleSecretIngestKey` set, ships structured logs to Maple.dev alongside the console output, in dev and production alike. */
  enableOtelTransport?: boolean;
  /** Maple.dev secret ingest key. Without it the OTel transport is skipped. */
  mapleSecretIngestKey?: string;
  /** Reported as `service.name` on exported logs; match the service's tracing serviceName. */
  serviceName?: string;
  /** Writes every line here and builds no console or Maple target (tests). */
  destination?: pino.DestinationStream;
}

/** Nested causes a serialized error is searched to; deeper ones are left as the serializer wrote them. */
const maxCauseDepth = 8;

/**
 * Removes failed queries from a serialized error and its causes, in place. A failed query's own node takes the
 * database's reason as its message and loses its `query` and `params`; any other message or stack quoting one is
 * redacted. Only error-like nodes (a string `message`) are touched: the serializer built those, the caller did not.
 */
const redactSerializedError = (node: unknown, depth = 0): void => {
  if (typeof node !== 'object' || node === null || depth > maxCauseDepth) return;
  const error = node as Record<string, unknown>;
  const { message, stack } = error;
  if (typeof message !== 'string') return;

  if (isFailedQueryMessage(message)) {
    const reason = failedQueryReason(error.cause);
    error.message = reason;
    if (typeof stack === 'string') error.stack = stack.split(message).join(reason);
    delete error.query;
    delete error.params;
  } else {
    error.message = redactFailedQuery(message);
  }
  if (typeof error.stack === 'string') error.stack = redactFailedQuery(error.stack);

  redactSerializedError(error.cause, depth + 1);
  if (Array.isArray(error.aggregateErrors)) {
    for (const inner of error.aggregateErrors) redactSerializedError(inner, depth + 1);
  }
};

/** Pino's `errWithCause` output ({ type, message, stack, cause }) without the SQL and values of a failed query. */
const serializeError = (err: unknown): unknown => {
  const serialized: unknown = pino.stdSerializers.errWithCause(err as Error);
  redactSerializedError(serialized);
  return serialized;
};

export const createLogger = ({
  level,
  isProduction,
  isTest,
  redactPaths,
  formatters,
  transportOptions,
  enableOtelTransport,
  mapleSecretIngestKey,
  serviceName,
  destination: injectedDestination,
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

  // pino-opentelemetry-transport runs in a worker thread with its own OTLP exporter, so it needs
  // the endpoint and ingest key passed explicitly. Enabled in dev too, so logs reach Maple in the
  // production shape while the console keeps pretty output.
  const otelTarget: pino.TransportTargetOptions | undefined =
    !injectedDestination && !isTest && enableOtelTransport && mapleSecretIngestKey
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

  // Without OTel: raw stdout in production (no worker thread), pretty transport in dev.
  const destination =
    injectedDestination ??
    (otelTarget
      ? pino.transport({ targets: [consoleTarget, otelTarget] })
      : isProduction
        ? undefined
        : pino.transport(consoleTarget));

  return pino(
    {
      level: level ?? (isTest ? 'silent' : 'info'),
      // Pino convention: an Error under `err` (or `error`) expands to { type, message, stack }, keeping nested
      // `cause` chains, which is where Drizzle puts pg errors. A logged `url` goes through `scrubUrl`.
      serializers: {
        err: serializeError,
        error: serializeError,
        url: (url: unknown) => (typeof url === 'string' ? scrubUrl(url) : url),
      },
      // Tag each line with the active OTel span so Maple joins logs to traces, including those
      // started by the frontend's traceparent.
      mixin() {
        const spanContext = trace.getActiveSpan()?.spanContext();
        return spanContext?.traceId ? { trace_id: spanContext.traceId, span_id: spanContext.spanId } : {};
      },
      formatters: {
        // Keep `level` numeric (10–60) when exporting to OTel so pino-opentelemetry-transport can
        // map it to an OTel severity; otherwise stringify it for nicer human-facing JSON.
        ...(!otelTarget && { level: (label) => ({ level: label.toUpperCase() }) }),
        ...formatters,
      },
      redact: { paths: [...redactPaths], censor: '[REDACTED]' },
    },
    destination,
  );
};

// Suppress repeats of the same warn/error/fatal line within this window, which retry loops and
// reconnects would otherwise flood. The first line after the window reports `repeated: N`.
const DEDUP_WINDOW_MS = 30_000;
const DEDUP_MAX_KEYS = 500;

/** Wrap non-Error throwables so the `err` serializer always yields { type, message, stack }. */
const toError = (err: unknown): Error => {
  if (err instanceof Error) return err;
  try {
    return new Error(typeof err === 'string' ? err : JSON.stringify(err));
  } catch {
    return new Error(String(err));
  }
};

export type LogMeta = { err?: unknown } & Record<string, unknown>;

export type LogFn = (msg: string, meta?: LogMeta) => void;
export type Log = Record<Severity, LogFn>;

/**
 * Level-method facade over a pino logger: `log.warn('msg', { err, ...meta })`. An `err` in meta
 * may be any throwable; it becomes an Error and expands to { type, message, stack }.
 */
export const createLog = (logger: pino.Logger): Log => {
  const recent = new Map<string, { lastEmitAt: number; suppressed: number }>();

  // Warn and above only: level filtering already handles heartbeats and progress messages.
  const shouldEmit = (severity: Severity, msg: string): { emit: boolean; repeated?: number } => {
    if (severity !== 'warn' && severity !== 'error' && severity !== 'fatal') return { emit: true };
    const key = `${severity}:${msg}`;
    const now = Date.now();
    const entry = recent.get(key);
    if (entry && now - entry.lastEmitAt < DEDUP_WINDOW_MS) {
      entry.suppressed += 1;
      return { emit: false };
    }
    if (recent.size >= DEDUP_MAX_KEYS) {
      for (const [staleKey, stale] of recent) {
        if (now - stale.lastEmitAt >= DEDUP_WINDOW_MS) recent.delete(staleKey);
      }
    }
    recent.set(key, { lastEmitAt: now, suppressed: 0 });
    return { emit: true, repeated: entry?.suppressed || undefined };
  };

  const emitAt =
    (severity: Severity): LogFn =>
    (msg, meta) => {
      const { emit, repeated } = shouldEmit(severity, msg);
      if (!emit) return;
      const { err, ...rest } = meta ?? {};
      logger[severity]({
        ...rest,
        ...(err !== undefined && { err: toError(err) }),
        ...(repeated && { repeated }),
        msg,
      });
    };

  return {
    trace: emitAt('trace'),
    debug: emitAt('debug'),
    info: emitAt('info'),
    warn: emitAt('warn'),
    error: emitAt('error'),
    fatal: emitAt('fatal'),
  };
};

interface WorkerLogEnv {
  NODE_ENV: string;
  PINO_LOG_LEVEL?: string;
  MAPLE_SECRET_INGEST_KEY?: string;
}

/**
 * For cdc and yjs: same construction, with the OTel service name `<app-slug>-<suffix>`. `redactPaths` is the
 * backend's `redactedFields` (lib/redact-keys.ts), so a worker censors the same keys the API does.
 */
export const createWorkerLog = (serviceSuffix: string, env: WorkerLogEnv, redactPaths: readonly string[]): Log =>
  createLog(
    createLogger({
      level: env.PINO_LOG_LEVEL,
      isProduction: env.NODE_ENV === 'production',
      isTest: env.NODE_ENV === 'test',
      enableOtelTransport: true,
      mapleSecretIngestKey: env.MAPLE_SECRET_INGEST_KEY,
      serviceName: `${appConfig.slug}-${serviceSuffix}`,
      redactPaths,
    }),
  );
