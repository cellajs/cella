import process from 'node:process';
import type { Transform } from 'node:stream';
import type { Attributes } from '@opentelemetry/api';
import { context, trace } from '@opentelemetry/api';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import build from 'pino-abstract-transport';
import { serviceResource } from './otel-resource.ts';

export interface OtelLogTransportOptions {
  resourceAttributes: Attributes;
  /** The sink's options for the logs signal (`OtlpSink`); empty when the exporter reads the standard OTLP variables. */
  exporterOptions: { url?: string; headers?: Record<string, string> };
}

/** What pino sends a transport before the first line: the message key and the level labels. */
interface PinoConfig {
  messageKey: string;
  levels: { labels: Record<number, string> };
}

/** OTel SeverityNumber per pino level: the lowest number of each range, as the log data model advises. */
const severityNumbers: Record<number, number> = { 10: 1, 20: 5, 30: 9, 40: 13, 50: 17, 60: 21 };

/**
 * The `exception.*` attributes of a line's serialized `err` or `error`; none without one. The type follows a span's
 * `recordException` (the error's `code`, else its `name`): one exception has one name on both signals.
 */
function exceptionAttributes(line: Record<string, unknown>): Attributes {
  const error = line.err ?? line.error;
  if (!error || typeof error !== 'object') return {};
  const { code, name, type, message, stack } = error as Record<string, unknown>;
  const exceptionType =
    code !== undefined && code !== null && code !== '' ? String(code) : typeof name === 'string' ? name : typeof type === 'string' ? type : undefined;
  return {
    ...(exceptionType && { 'exception.type': exceptionType }),
    ...(typeof message === 'string' && message && { 'exception.message': message }),
    ...(typeof stack === 'string' && { 'exception.stacktrace': stack }),
  };
}

/**
 * The OTel log record for one pino line: the message as body, the level as severity, the other fields as attributes.
 * `createLogger`'s mixin stamps the active span onto each line; with all three ids the record joins that trace.
 */
export function toLogRecord(line: Record<string, unknown>, { messageKey, levels }: PinoConfig) {
  const { time, level, hostname, pid, [messageKey]: body, trace_id, span_id, trace_flags, ...attributes } = line;
  const linked = typeof trace_id === 'string' && typeof span_id === 'string' && typeof trace_flags === 'number';
  return {
    timestamp: time as number,
    body: body as string,
    severityNumber: severityNumbers[level as number] ?? 0,
    severityText: levels.labels[level as number],
    attributes: { ...(attributes as Attributes), ...exceptionAttributes(line) },
    context: linked
      ? trace.setSpanContext(context.active(), { traceId: trace_id, spanId: span_id, traceFlags: trace_flags, isRemote: true })
      : context.active(),
  };
}

/**
 * The pino transport that ships log lines to the OTLP sink over HTTP. `createLogger` (./pino.ts) starts it in pino's
 * worker thread with the sink's exporter options and the service's resource attributes; a service build emits it as
 * its own bundle entry next to the service bundle.
 */
export default async function otelLogTransport({ resourceAttributes, exporterOptions }: OtelLogTransportOptions) {
  // Gzipped, as ./otel.ts sets it for traces and metrics.
  // biome-ignore lint/style/noProcessEnv: the OTel exporter reads this env var itself; writing it is the only way to pass the setting through
  process.env.OTEL_EXPORTER_OTLP_COMPRESSION ??= 'gzip';
  const provider = new LoggerProvider({
    resource: serviceResource(resourceAttributes),
    processors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter(exporterOptions) })],
  });
  // An empty name keeps the SDK's default scope (`unknown`), the scope pino's records carry in the sink.
  const logger = provider.getLogger('');

  return build(
    async (source) => {
      const config = source as Transform & PinoConfig;
      for await (const line of source) logger.emit(toLogRecord(line, config));
    },
    { close: () => provider.shutdown(), expectPinoConfig: true },
  );
}
