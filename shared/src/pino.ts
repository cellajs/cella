import { trace } from '@opentelemetry/api';
import pino from 'pino';
import type { Severity } from '../types.ts';
import { appConfig } from './config-builder/app-config.ts';
import { type OtlpSink, resolveOtlpSink } from './otlp-sink.ts';
import { failedQueryReason, isFailedQueryMessage, replaceInStack } from './utils/failed-query.ts';
import { scrubText, scrubUrl } from './utils/scrub-url.ts';

export type { Logger } from 'pino';

interface CreateLoggerOptions {
  level?: string;
  isProduction: boolean;
  isTest: boolean;
  /** Keys censored in every line (fast-redact paths): secret columns and transport keys. Required, so no logger skips it. */
  redactPaths: readonly string[];
  formatters?: pino.LoggerOptions['formatters'];
  transportOptions?: Record<string, unknown>;
  /** Where structured logs ship alongside the console output, in dev and production alike (`resolveOtlpSink`). Absent, the console is the only target. */
  sink?: OtlpSink;
  /** Reported as `service.name` on exported logs; match the service's tracing serviceName. */
  serviceName?: string;
  /** Release identifier reported as `service.version` on exported logs. */
  serviceVersion?: string;
  /** Writes every line here and builds no console or OTel target (tests). */
  destination?: pino.DestinationStream;
}

/** Nested causes a serialized error is searched to; deeper ones are left as the serializer wrote them. */
const maxCauseDepth = 8;

/** The fields of a database error that quote the row or statement: a unique violation's `detail` names the value. */
const valueQuotingFields = ['detail', 'where', 'internalQuery'] as const;

/**
 * Removes failed queries and URL secrets from a serialized error and its causes, in place. A failed query's own node
 * takes the database's reason as its message and loses its `query` and `params`; every message and stack goes through
 * `redactFailedQuery` and `scrubUrl`, and the fields a database error quotes values in go. Only error-like nodes (a
 * string `message`) are touched: the serializer built those, the caller did not.
 */
const redactSerializedError = (node: unknown, depth = 0): void => {
  if (typeof node !== 'object' || node === null || depth > maxCauseDepth) return;
  const error = node as Record<string, unknown>;
  const { message, stack } = error;
  if (typeof message !== 'string') return;

  if (isFailedQueryMessage(message)) {
    const reason = failedQueryReason(error.cause);
    error.message = scrubUrl(reason);
    if (typeof stack === 'string') error.stack = replaceInStack(stack, message, reason);
    delete error.query;
    delete error.params;
  } else {
    error.message = scrubText(message);
  }
  if (typeof error.stack === 'string') error.stack = scrubText(error.stack);
  for (const field of valueQuotingFields) delete error[field];

  redactSerializedError(error.cause, depth + 1);
  if (Array.isArray(error.aggregateErrors)) {
    for (const inner of error.aggregateErrors) redactSerializedError(inner, depth + 1);
  }
};

/** Pino's `errWithCause` output ({ type, message, stack, cause }) without failed-query values or URL secrets. */
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
  sink,
  serviceName,
  serviceVersion,
  destination: injectedDestination,
}: CreateLoggerOptions): pino.Logger => {
  // Console target: human-readable pretty in dev, raw JSON on stdout in production/containers.
  const consoleTarget: pino.TransportTargetOptions = isProduction
    ? { target: 'pino/file', options: { destination: 1 } }
    : {
        target: 'pino-pretty',
        options: { colorize: true, singleLine: true, ignore: 'pid,hostname', ...transportOptions },
      };

  // pino-opentelemetry-transport runs in a worker thread with its own OTLP exporter, so it is handed the
  // sink's options. Enabled in dev too, so logs reach the sink in the production shape while the console
  // keeps pretty output.
  const otelTarget: pino.TransportTargetOptions | undefined =
    !injectedDestination && !isTest && sink
      ? {
          target: 'pino-opentelemetry-transport',
          options: {
            resourceAttributes: {
              ...(serviceName && { 'service.name': serviceName }),
              ...(serviceVersion && { 'service.version': serviceVersion }),
              // OTel semantic convention: deploy environment (development/staging/production/…).
              'deployment.environment.name': appConfig.mode,
            },
            logRecordProcessorOptions: {
              recordProcessorType: 'batch',
              exporterOptions: {
                protocol: 'http',
                httpExporterOptions: sink('logs'),
              },
            },
          },
        }
      : undefined;

  // Without OTel: raw stdout in production (no worker thread), pretty transport in dev.
  const destination =
    injectedDestination ??
    (otelTarget ? pino.transport({ targets: [consoleTarget, otelTarget] }) : isProduction ? undefined : pino.transport(consoleTarget));

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
      // Tag each line with the active OTel span so the sink joins logs to traces, including those started by the
      // frontend's traceparent. The OTel transport links a record only when it finds all three keys.
      mixin() {
        const spanContext = trace.getActiveSpan()?.spanContext();
        return spanContext?.traceId ? { trace_id: spanContext.traceId, span_id: spanContext.spanId, trace_flags: spanContext.traceFlags } : {};
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
        // A message can quote a URL, as a logged `url` does.
        msg: scrubUrl(msg),
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
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  RELEASE_SHA?: string;
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
      sink: resolveOtlpSink(env),
      serviceName: `${appConfig.slug}-${serviceSuffix}`,
      serviceVersion: env.RELEASE_SHA,
      redactPaths,
    }),
  );
