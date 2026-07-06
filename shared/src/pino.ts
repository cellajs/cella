import { trace } from '@opentelemetry/api';
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
      // Pino convention: an Error under the `err` key is expanded to { type, message, stack },
      // with nested `cause` chains preserved (Drizzle wraps pg errors as cause).
      // pino-pretty renders `err` with its stack in dev; the OTel transport ships it structured.
      serializers: { err: pino.stdSerializers.errWithCause },
      // Correlate every log line with the active OTel span so Maple can join
      // logs to traces (including traces originated by the frontend's traceparent).
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
      ...(redact && { redact }),
    },
    destination,
  );
};

// Suppress repeats of the same warn/error/fatal line within this window (spam from retry
// loops, reconnects). The first repeat after the window carries `repeated: N` so suppression
// is never silent — same shape as zap sampling and Kubernetes event counts.
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
 * Level-method log facade over a pino logger: `log.warn('msg', { err, ...meta })`.
 * An `err` in meta may be any throwable; it is normalized to an Error and expanded
 * by the `err` serializer to { type, message, stack } at any severity.
 */
export const createLog = (logger: pino.Logger): Log => {
  const recent = new Map<string, { lastEmitAt: number; suppressed: number }>();

  // Dedup applies to warn and above only — info/debug/trace repetition is intentional
  // (heartbeats, progress) and filtered by level instead.
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
